import { useTranslation } from '@rocket.chat/ui-contexts';
import type { ReactElement } from 'react';
import React from 'react';

import { GenericResourceUsage } from '../../../components/GenericResourceUsage';

const EnabledAppsCount = ({
	variant,
	percentage,
	limit,
	enabled,
	context,
}: {
	variant: 'warning' | 'danger' | 'success';
	percentage: number;
	limit: number;
	enabled: number;
	context: 'private' | 'explore' | 'installed' | 'premium' | 'requested';
}): ReactElement | null => {
	const t = useTranslation();

	const privateAppsCountText: string =
		enabled === 1 ? t('Private_Apps_Count_Enabled', { count: enabled }) : t('Private_Apps_Count_Enabled_plural', { count: enabled });
	const marketplaceAppsCountText: string =
		enabled === 1 ? t('Apps_Count_Enabled', { count: enabled }) : t('Apps_Count_Enabled_plural', { count: enabled });

	return (
		<GenericResourceUsage
			title={context === 'private' ? privateAppsCountText : marketplaceAppsCountText}
			value={enabled}
			max={limit}
			percentage={percentage}
			threshold={80}
			variant={variant}
		/>
	);
};

export default EnabledAppsCount;
