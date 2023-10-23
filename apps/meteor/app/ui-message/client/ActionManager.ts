import type { DistributiveOmit, UiKit } from '@rocket.chat/core-typings';
import { Emitter } from '@rocket.chat/emitter';
import { Random } from '@rocket.chat/random';
import type { ActionManagerContext, RouterContext } from '@rocket.chat/ui-contexts';
import type { ContextType } from 'react';
import { lazy } from 'react';

import * as banners from '../../../client/lib/banners';
import { imperativeModal } from '../../../client/lib/imperativeModal';
import { router } from '../../../client/providers/RouterProvider';
import { sdk } from '../../utils/client/lib/SDKClient';
import { UiKitTriggerTimeoutError } from './UiKitTriggerTimeoutError';

const UiKitModal = lazy(() => import('../../../client/views/modal/uikit/UiKitModal'));

type ActionManagerType = Exclude<ContextType<typeof ActionManagerContext>, undefined>;

export class ActionManager implements ActionManagerType {
	protected static TRIGGER_TIMEOUT = 5000;

	protected static TRIGGER_TIMEOUT_ERROR = 'TRIGGER_TIMEOUT_ERROR';

	protected events = new Emitter<{ busy: { busy: boolean }; [viewId: string]: any }>();

	protected triggersId = new Map<string, string | undefined>();

	protected viewInstances = new Map<
		string,
		{
			payload?: {
				view: UiKit.ContextualBarView;
			};
			close: () => void;
		}
	>();

	public constructor(protected router: ContextType<typeof RouterContext>) {}

	protected invalidateTriggerId(id: string) {
		const appId = this.triggersId.get(id);
		this.triggersId.delete(id);
		return appId;
	}

	public on(viewId: string, listener: (data: any) => void): void;

	public on(eventName: 'busy', listener: ({ busy }: { busy: boolean }) => void): void;

	public on(eventName: string, listener: (data: any) => void) {
		return this.events.on(eventName, listener);
	}

	public off(viewId: string, listener: (data: any) => any): void;

	public off(eventName: 'busy', listener: ({ busy }: { busy: boolean }) => void): void;

	public off(eventName: string, listener: (data: any) => void) {
		return this.events.off(eventName, listener);
	}

	public generateTriggerId(appId: string | undefined) {
		const triggerId = Random.id();
		this.triggersId.set(triggerId, appId);
		setTimeout(() => this.invalidateTriggerId(triggerId), ActionManager.TRIGGER_TIMEOUT);
		return triggerId;
	}

	public async emitInteraction(appId: string, userInteraction: DistributiveOmit<UiKit.UserInteraction, 'triggerId'>) {
		this.events.emit('busy', { busy: true });

		const triggerId = this.generateTriggerId(appId);

		let timeout: ReturnType<typeof setTimeout> | undefined;

		await Promise.race([
			new Promise((_, reject) => {
				timeout = setTimeout(() => reject(new UiKitTriggerTimeoutError('Timeout', { triggerId, appId })), ActionManager.TRIGGER_TIMEOUT);
			}),
			sdk.rest
				.post(`/apps/ui.interaction/${appId}`, {
					...userInteraction,
					triggerId,
				})
				.then((interaction) => this.handleServerInteraction(interaction)),
		]).finally(() => {
			if (timeout) clearTimeout(timeout);
			this.events.emit('busy', { busy: false });
		});
	}

	public handleServerInteraction(interaction: UiKit.ServerInteraction) {
		const { triggerId } = interaction;

		if (!this.triggersId.has(triggerId)) {
			return;
		}

		const appId = this.invalidateTriggerId(triggerId);
		if (!appId) {
			return;
		}

		switch (interaction.type) {
			case 'errors': {
				const { type, triggerId, viewId, appId, errors } = interaction;
				this.events.emit(interaction.viewId, {
					type,
					triggerId,
					viewId,
					appId,
					errors,
				});
				break;
			}

			case 'modal.open': {
				const { view } = interaction;
				const instance = imperativeModal.open({
					component: UiKitModal,
					props: {
						key: view.id,
						initialView: interaction.view,
					},
				});

				this.viewInstances.set(view.id, {
					close: () => {
						instance.close();
						this.viewInstances.delete(view.id);
					},
				});
				break;
			}

			case 'modal.update':
			case 'contextual_bar.update': {
				const { type, triggerId, appId, view } = interaction;
				this.events.emit(view.id, {
					type,
					triggerId,
					viewId: view.id,
					appId,
					view,
				});
				break;
			}

			case 'modal.close': {
				break;
			}

			case 'banner.open': {
				const { type, triggerId, ...view } = interaction;
				banners.open(view);
				this.viewInstances.set(view.viewId, {
					close: () => {
						banners.closeById(view.viewId);
					},
				});
				break;
			}

			case 'banner.update': {
				const { type, triggerId, appId, view } = interaction;
				this.events.emit(view.viewId, {
					type,
					triggerId,
					viewId: view.viewId,
					appId,
					view,
				});
				break;
			}

			case 'banner.close': {
				const { viewId } = interaction;
				this.viewInstances.get(viewId)?.close();

				break;
			}

			case 'contextual_bar.open': {
				const { view } = interaction;
				this.viewInstances.set(view.id, {
					payload: {
						view,
					},
					close: () => {
						this.viewInstances.delete(view.id);
					},
				});

				const routeName = this.router.getRouteName();
				const routeParams = this.router.getRouteParameters();

				if (!routeName) {
					break;
				}

				this.router.navigate({
					name: routeName,
					params: {
						...routeParams,
						tab: 'app',
						context: view.id,
					},
				});
				break;
			}

			case 'contextual_bar.close': {
				const { view } = interaction;
				this.viewInstances.get(view.id)?.close();
				break;
			}
		}

		return interaction.type;
	}

	public getInteractionPayloadByViewId(viewId: UiKit.ContextualBarView['id']) {
		if (!viewId) {
			throw new Error('No viewId provided when checking for `user interaction payload`');
		}

		return this.viewInstances.get(viewId)?.payload;
	}

	public disposeView(viewId: UiKit.ModalView['id'] | UiKit.BannerView['viewId'] | UiKit.ContextualBarView['id']) {
		const instance = this.viewInstances.get(viewId);
		instance?.close?.();
		this.viewInstances.delete(viewId);
	}
}

/** @deprecated consumer should use the context instead */
export const actionManager = new ActionManager(router);
