import { MockedLicenseBuilder, getReadyLicenseManager } from '../__tests__/MockedLicenseBuilder';

it('should not prevent if there is no license', async () => {
	const license = await getReadyLicenseManager();
	const result = await license.shouldPreventAction('activeUsers');
	expect(result).toBe(false);
});

it('should not prevent if the counter is under the limit', async () => {
	const licenseManager = await getReadyLicenseManager();

	const license = await new MockedLicenseBuilder().withLimits('activeUsers', [
		{
			max: 10,
			behavior: 'prevent_action',
		},
	]);

	await expect(licenseManager.setLicense(await license.sign())).resolves.toBe(true);

	licenseManager.setLicenseLimitCounter('activeUsers', () => 5);
	await expect(licenseManager.shouldPreventAction('activeUsers')).resolves.toBe(false);
});

it('should not prevent actions if there is no limit set in the license', async () => {
	const licenseManager = await getReadyLicenseManager();

	const license = await new MockedLicenseBuilder();

	await expect(licenseManager.setLicense(await license.sign())).resolves.toBe(true);

	licenseManager.setLicenseLimitCounter('activeUsers', () => 5);
	licenseManager.setLicenseLimitCounter('monthlyActiveContacts', () => 5);
	await expect(licenseManager.shouldPreventAction('activeUsers')).resolves.toBe(false);
	await expect(licenseManager.shouldPreventAction('monthlyActiveContacts')).resolves.toBe(false);
});

it('should prevent if the counter is equal or over the limit', async () => {
	const licenseManager = await getReadyLicenseManager();

	const license = await new MockedLicenseBuilder().withLimits('activeUsers', [
		{
			max: 10,
			behavior: 'prevent_action',
		},
	]);

	await expect(licenseManager.setLicense(await license.sign())).resolves.toBe(true);

	licenseManager.setLicenseLimitCounter('activeUsers', () => 10);
	await expect(licenseManager.shouldPreventAction('activeUsers')).resolves.toBe(true);

	licenseManager.setLicenseLimitCounter('activeUsers', () => 11);
	await expect(licenseManager.shouldPreventAction('activeUsers')).resolves.toBe(true);
});

it('should not prevent an action if another limit is over the limit', async () => {
	const licenseManager = await getReadyLicenseManager();

	const license = await new MockedLicenseBuilder()
		.withLimits('activeUsers', [
			{
				max: 10,
				behavior: 'prevent_action',
			},
		])
		.withLimits('monthlyActiveContacts', [
			{
				max: 10,
				behavior: 'prevent_action',
			},
		]);

	await expect(licenseManager.setLicense(await license.sign())).resolves.toBe(true);

	licenseManager.setLicenseLimitCounter('activeUsers', () => 11);
	licenseManager.setLicenseLimitCounter('monthlyActiveContacts', () => 2);
	await expect(licenseManager.shouldPreventAction('monthlyActiveContacts')).resolves.toBe(false);
	await expect(licenseManager.shouldPreventAction('activeUsers')).resolves.toBe(true);
});

describe('Validate License Limits', () => {
	describe('prevent_action behavior', () => {
		describe('during the licensing apply', () => {
			it('should not trigger the event even if the counter is over the limit', async () => {
				const licenseManager = await getReadyLicenseManager();

				const preventActionCallback = jest.fn();

				const license = await new MockedLicenseBuilder().withLimits('activeUsers', [
					{
						max: 10,
						behavior: 'prevent_action',
					},
				]);

				licenseManager.onBehaviorTriggered('prevent_action', preventActionCallback);
				licenseManager.setLicenseLimitCounter('activeUsers', () => 10);

				await expect(licenseManager.setLicense(await license.sign())).resolves.toBe(true);

				expect(preventActionCallback).toHaveBeenCalledTimes(0);
			});
		});
	});
	describe('fair usage behavior', () => {
		it('should change the flag to true if the counter is equal or over the limit', async () => {
			const licenseManager = await getReadyLicenseManager();

			const fairUsageCallback = jest.fn();
			const preventActionCallback = jest.fn();

			licenseManager.onBehaviorTriggered('start_fair_policy', fairUsageCallback);
			licenseManager.onBehaviorTriggered('prevent_action', preventActionCallback);

			const license = await new MockedLicenseBuilder().withLimits('activeUsers', [
				{
					max: 10,
					behavior: 'prevent_action',
				},
				{
					max: 10,
					behavior: 'start_fair_policy',
				},
			]);

			await expect(licenseManager.setLicense(await license.sign())).resolves.toBe(true);

			licenseManager.setLicenseLimitCounter('activeUsers', () => 5);
			await expect(licenseManager.shouldPreventAction('activeUsers')).resolves.toBe(false);
			await expect(licenseManager.shouldPreventAction('activeUsers')).resolves.toBe(false);
			expect(fairUsageCallback).toHaveBeenCalledTimes(0);
			expect(preventActionCallback).toHaveBeenCalledTimes(0);

			preventActionCallback.mockClear();
			fairUsageCallback.mockClear();
			licenseManager.setLicenseLimitCounter('activeUsers', () => 10);
			await expect(licenseManager.shouldPreventAction('activeUsers')).resolves.toBe(true);
			expect(fairUsageCallback).toHaveBeenCalledTimes(0);
			expect(preventActionCallback).toHaveBeenCalledTimes(1);

			licenseManager.setLicenseLimitCounter('activeUsers', () => 11);
			preventActionCallback.mockClear();
			fairUsageCallback.mockClear();
			await expect(licenseManager.shouldPreventAction('activeUsers')).resolves.toBe(true);
			await expect(licenseManager.shouldPreventAction('activeUsers')).resolves.toBe(true);
			await expect(licenseManager.shouldPreventAction('activeUsers')).resolves.toBe(true);
			await expect(licenseManager.shouldPreventAction('activeUsers')).resolves.toBe(true);
			expect(preventActionCallback).toHaveBeenCalledTimes(4);
			expect(fairUsageCallback).toHaveBeenCalledTimes(4);
		});
	});

	describe('invalidate_license behavior', () => {
		it('should invalidate the license if the counter is over the limit', async () => {
			const licenseManager = await getReadyLicenseManager();

			const invalidateCallback = jest.fn();

			const license = await new MockedLicenseBuilder().withLimits('activeUsers', [
				{
					max: 10,
					behavior: 'prevent_action',
				},
				{
					max: 10,
					behavior: 'invalidate_license',
				},
			]);

			licenseManager.on('invalidate', invalidateCallback);

			await expect(licenseManager.setLicense(await license.sign())).resolves.toBe(true);

			await expect(licenseManager.shouldPreventAction('activeUsers')).resolves.toBe(false);
			await expect(licenseManager.hasValidLicense()).toBe(true);

			licenseManager.setLicenseLimitCounter('activeUsers', () => 5);
			await expect(licenseManager.shouldPreventAction('activeUsers')).resolves.toBe(false);
			await expect(licenseManager.hasValidLicense()).toBe(true);

			await licenseManager.setLicenseLimitCounter('activeUsers', () => 10);
			await expect(licenseManager.shouldPreventAction('activeUsers')).resolves.toBe(true);
			await expect(licenseManager.hasValidLicense()).toBe(true);
			expect(invalidateCallback).toHaveBeenCalledTimes(0);

			await licenseManager.setLicenseLimitCounter('activeUsers', () => 11);
			await expect(licenseManager.shouldPreventAction('activeUsers')).resolves.toBe(true);
			await expect(licenseManager.hasValidLicense()).toBe(false);
			expect(invalidateCallback).toHaveBeenCalledTimes(1);
		});
	});

	describe('prevent action for future limits', () => {
		it('should prevent if the counter plus the extra value is equal or over the limit', async () => {
			const licenseManager = await getReadyLicenseManager();

			const license = await new MockedLicenseBuilder().withLimits('activeUsers', [
				{
					max: 10,
					behavior: 'prevent_action',
				},
			]);

			const fairUsageCallback = jest.fn();
			const preventActionCallback = jest.fn();

			licenseManager.onBehaviorTriggered('start_fair_policy', fairUsageCallback);
			licenseManager.onBehaviorTriggered('prevent_action', preventActionCallback);

			await expect(licenseManager.setLicense(await license.sign())).resolves.toBe(true);

			licenseManager.setLicenseLimitCounter('activeUsers', () => 5);
			await expect(licenseManager.shouldPreventAction('activeUsers')).resolves.toBe(false);
			expect(fairUsageCallback).toHaveBeenCalledTimes(0);
			expect(preventActionCallback).toHaveBeenCalledTimes(0);

			for await (const extraCount of [1, 2, 3, 4, 5]) {
				await expect(licenseManager.shouldPreventAction('activeUsers', extraCount)).resolves.toBe(false);
				expect(fairUsageCallback).toHaveBeenCalledTimes(0);
				expect(preventActionCallback).toHaveBeenCalledTimes(0);
			}

			/**
			 * if we are testing the current count 10 should prevent the action, if we are testing the future count 10 should not prevent the action but 11
			 */

			await expect(licenseManager.shouldPreventAction('activeUsers', 6)).resolves.toBe(true);
			expect(fairUsageCallback).toHaveBeenCalledTimes(0);
			expect(preventActionCallback).toHaveBeenCalledTimes(0);
		});
	});
});
