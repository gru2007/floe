// TON Connect message builders. Every action is signed in the user's own wallet.
import { Address, Cell } from '@ton/core';
import {
  buyBody,
  claimFeesBody,
  createTokenBody,
  createTokenValue,
  CurveParams,
  jettonWalletAddress,
  Limits,
  sellBody,
  transferBody,
} from '@shared/protocol';
import type { TokenInfo } from './chain';

export interface TcMessage {
  address: string;
  amount: string;
  payload?: string;
}

export interface TcRequest {
  validUntil: number;
  messages: TcMessage[];
}

const until = () => Math.floor(Date.now() / 1000) + 300;
const boc = (c: Cell) => c.toBoc().toString('base64');
const addr = (a: Address, testnet: boolean) => a.toString({ bounceable: true, testOnly: testnet, urlSafe: true });

export const slippageMin = (v: bigint, slippagePct: number) => (v * BigInt(Math.round((100 - slippagePct) * 100))) / 10000n;

export function buyTx(t: TokenInfo, tonIn: bigint, minOut: bigint, testnet: boolean): TcRequest {
  return {
    validUntil: until(),
    messages: [{ address: addr(t.address, testnet), amount: (tonIn + Limits.BUY_GAS).toString(), payload: boc(buyBody(minOut, BigInt(Date.now()))) }],
  };
}

export function sellTx(t: TokenInfo, owner: Address, amount: bigint, minTonOut: bigint, testnet: boolean): TcRequest {
  const wallet = jettonWalletAddress(owner, t.address, t.state.walletCode);
  return {
    validUntil: until(),
    messages: [
      {
        address: addr(wallet, testnet),
        amount: Limits.SELL_VALUE.toString(),
        payload: boc(sellBody({ amount, responseAddress: owner, minTonOut, queryId: BigInt(Date.now()) })),
      },
    ],
  };
}

export function sendTx(t: TokenInfo, owner: Address, to: Address, amount: bigint, testnet: boolean): TcRequest {
  const wallet = jettonWalletAddress(owner, t.address, t.state.walletCode);
  return {
    validUntil: until(),
    messages: [
      {
        address: addr(wallet, testnet),
        amount: '60000000',
        payload: boc(transferBody({ amount, to, responseAddress: owner, forwardTon: 1n, queryId: BigInt(Date.now()) })),
      },
    ],
  };
}

export function claimTx(t: TokenInfo, testnet: boolean): TcRequest {
  return { validUntil: until(), messages: [{ address: addr(t.address, testnet), amount: Limits.CLAIM_VALUE.toString(), payload: boc(claimFeesBody()) }] };
}

export function createTx(
  factory: Address,
  deployFee: bigint,
  p: { creatorFeeBps: number; devBuy: bigint; minOut: bigint; curve: CurveParams; content: Cell },
  testnet: boolean,
): TcRequest {
  return {
    validUntil: until(),
    messages: [{ address: addr(factory, testnet), amount: createTokenValue(deployFee, p.devBuy).toString(), payload: boc(createTokenBody(p)) }],
  };
}
