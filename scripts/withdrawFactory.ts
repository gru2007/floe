import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { Factory } from '../wrappers/Factory';

/** npx blueprint run withdrawFactory <factory-address> [amountTON] */
export async function run(provider: NetworkProvider, args: string[]) {
    const factory = provider.open(Factory.createFromAddress(Address.parse(args[0] ?? (await provider.ui().input('Factory address')))));
    await factory.sendWithdraw(provider.sender(), toNano(args[1] ?? '1000000'));
}
