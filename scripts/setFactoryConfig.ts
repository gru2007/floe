import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { Factory } from '../wrappers/Factory';

/** npx blueprint run setFactoryConfig <factory-address> <deployFeeTON> <platformFeeBps> */
export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();
    const factory = provider.open(Factory.createFromAddress(Address.parse(args[0] ?? (await ui.input('Factory address')))));
    const fee = toNano(args[1] ?? (await ui.input('Deploy fee, TON')));
    const bps = Number(args[2] ?? (await ui.input('Platform fee, bps (100 = 1%, max 200)')));
    await factory.sendSetConfig(provider.sender(), fee, bps);
}
