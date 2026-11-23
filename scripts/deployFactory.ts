import { toNano } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { Factory } from '../wrappers/Factory';

/**
 * npx blueprint run deployFactory --testnet --tonconnect
 * After deploy put the printed address into app/public/floe.config.json -> networks.<network>.factories, and set activeFactory to it.
 */
export async function run(provider: NetworkProvider) {
    const owner = provider.sender().address!;
    const deployFee = toNano(process.env.DEPLOY_FEE ?? '0.3');
    const platformFeeBps = Number(process.env.PLATFORM_FEE_BPS ?? '100'); // 1%

    const factory = provider.open(
        Factory.createFromConfig(
            {
                owner,
                deployFee,
                platformFeeBps,
                tokenCode: await compile('Token'),
                walletCode: await compile('JettonWallet'),
            },
            await compile('Factory'),
        ),
    );

    await factory.sendDeploy(provider.sender(), toNano('0.3'));
    await provider.waitForDeploy(factory.address);
    console.log('Factory:', factory.address.toString({ testOnly: provider.network() !== 'mainnet' }));
    console.log(await factory.getFactoryData());
}
