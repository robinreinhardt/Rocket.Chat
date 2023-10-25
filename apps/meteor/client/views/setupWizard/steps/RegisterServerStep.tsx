import { RegisterServerPage, RegisterOfflinePage } from '@rocket.chat/onboarding-ui';
import { useEndpoint, useMethod, useTranslation } from '@rocket.chat/ui-contexts';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ReactElement, ComponentProps } from 'react';
import React, { useState } from 'react';

import { queryClient } from '../../../lib/queryClient';
import { dispatchToastMessage } from '../../../lib/toast';
import { useSetupWizardContext } from '../contexts/SetupWizardContext';

const SERVER_OPTIONS = {
	REGISTERED: 'REGISTERED',
	OFFLINE: 'OFFLINE',
};

const RegisterServerStep = (): ReactElement => {
	const t = useTranslation();
	const { currentStep, goToNextStep, setSetupWizardData, registerServer, maxSteps, completeSetupWizard } = useSetupWizardContext();
	const [serverOption, setServerOption] = useState(SERVER_OPTIONS.REGISTERED);

	const handleRegister: ComponentProps<typeof RegisterServerPage>['onSubmit'] = async (data: {
		email: string;
		agreement: boolean;
		updates: boolean;
		resend?: boolean;
	}) => {
		goToNextStep();
		setSetupWizardData((prevState) => ({ ...prevState, serverData: data }));
		await registerServer(data);
	};

	const registerManually = useEndpoint('POST', '/v1/cloud.manualRegister');
	const registerPreIntent = useEndpoint('POST', '/v1/cloud.registerPreIntent');
	const getWorkspaceRegisterData = useMethod('cloud:getWorkspaceRegisterData');

	const { data: clientKey } = useQuery(['setupWizard/clientKey'], async () => getWorkspaceRegisterData(), {
		staleTime: Infinity,
	});

	const { data } = useQuery(['setupWizard/registerIntent'], async () => registerPreIntent(), {
		staleTime: Infinity,
	});

	const { mutate } = useMutation<null, unknown, string>(
		['setupWizard/confirmOfflineRegistration'],
		async (token) => registerManually({ cloudBlob: token }),
		{
			onSuccess: () => {
				queryClient.invalidateQueries(['licenses']);
				completeSetupWizard();
			},
			onError: () => {
				dispatchToastMessage({ type: 'error', message: t('Cloud_register_error') });
			},
		},
	);

	const handleConfirmOffline: ComponentProps<typeof RegisterOfflinePage>['onSubmit'] = ({ token }) => {
		mutate(token);
	};

	if (serverOption === SERVER_OPTIONS.OFFLINE) {
		return (
			<RegisterOfflinePage
				termsHref='https://rocket.chat/terms'
				policyHref='https://rocket.chat/privacy'
				clientKey={clientKey || ''}
				onBackButtonClick={(): void => setServerOption(SERVER_OPTIONS.REGISTERED)}
				onSubmit={handleConfirmOffline}
			/>
		);
	}

	return (
		<RegisterServerPage
			onClickRegisterOffline={(): void => setServerOption(SERVER_OPTIONS.OFFLINE)}
			stepCount={maxSteps}
			onSubmit={handleRegister}
			currentStep={currentStep}
			offline={!data || data.offline}
		/>
	);
};

export default RegisterServerStep;
