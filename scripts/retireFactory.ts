import { Address } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { Factory } from '../wrappers/Factory';

/** blueprint run retireFactory <old> <new> --testnet --tonconnect */
export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();
    const oldAddress = Address.parse(args[0] ?? await ui.input('Factory to retire'));
    const nextAddress = Address.parse(args[1] ?? await ui.input('New active factory'));
    if (oldAddress.equals(nextAddress)) throw new Error('Successor must be a different factory');
    if (!await provider.isContractDeployed(nextAddress)) throw new Error('Deploy the new factory first');
    const previous = provider.open(Factory.createFromAddress(oldAddress));
    const next = provider.open(Factory.createFromAddress(nextAddress));
    const [oldData, newData] = await Promise.all([previous.getFactoryData(), next.getFactoryData()]);
    if (!oldData.migrationSupported) throw new Error('Legacy factory cannot be retired on-chain. Keep it in factories for reading; switch activeFactory in the site config.');
    if (!oldData.creationEnabled) throw new Error('This factory is already retired');
    if (!newData.migrationSupported || !newData.creationEnabled) throw new Error('Successor must be an active factory with migration support');
    if (!provider.sender().address?.equals(oldData.owner)) throw new Error('Connect the retiring factory owner wallet');
    if (!oldData.owner.equals(newData.owner)) throw new Error('Successor has a different owner; verify the factory address');
    ui.write(`Permanently retiring ${oldAddress.toString()} in favour of ${nextAddress.toString()}. Existing token contracts will keep working.`);
    await previous.sendRetire(provider.sender(), nextAddress);
    ui.write('Retirement transaction sent. After confirmation, keep both addresses in networks.<network>.factories and set activeFactory to the successor.');
}
