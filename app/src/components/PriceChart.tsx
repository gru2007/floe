import { useEffect, useMemo, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { spotPrice, type CurveParams } from '@shared/protocol';
import type { Trade } from '../lib/chain';
import { formatPrice } from '../lib/format';

export interface Candle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVol: number;
}

/** Candles from on-chain trade logs: price after each trade = spot price at the new supply. */
export function buildCandles(trades: Trade[], curve: CurveParams, tf: number, createdAt: number): Candle[] {
  const out: Candle[] = [];
  let prev = spotPrice(curve, 0n);
  if (!trades.length) {
    const t = (Math.floor(createdAt / tf) * tf) as UTCTimestamp;
    return [{ time: t, open: prev, high: prev, low: prev, close: prev, volume: 0, buyVol: 0 }];
  }
  for (const tr of trades) {
    const supplyAfter = BigInt(tr.supply);
    const supplyBefore = tr.isBuy ? supplyAfter - BigInt(tr.jettons) : supplyAfter + BigInt(tr.jettons);
    const open = out.length ? prev : spotPrice(curve, supplyBefore > 0n ? supplyBefore : 0n);
    const price = spotPrice(curve, supplyAfter);
    const bucket = (Math.floor(tr.time / tf) * tf) as UTCTimestamp;
    const vol = Number(BigInt(tr.ton)) / 1e9;
    const last = out[out.length - 1];
    if (last && last.time === bucket) {
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      last.close = price;
      last.volume += vol;
      if (tr.isBuy) last.buyVol += vol;
    } else if (last && bucket < last.time) {
      // out-of-order timestamp (same block reordering): fold into last candle
      last.close = price;
      last.volume += vol;
    } else {
      out.push({ time: bucket, open, high: Math.max(open, price), low: Math.min(open, price), close: price, volume: vol, buyVol: tr.isBuy ? vol : 0 });
    }
    prev = price;
  }
  return out;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function PriceChart({ trades, curve, tf, createdAt, scheme }: { trades: Trade[]; curve: CurveParams; tf: number; createdAt: number; scheme: string }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null);
  const data = useMemo(() => buildCandles(trades, curve, tf, createdAt), [trades, curve, tf, createdAt]);

  useEffect(() => {
    if (!el.current) return;
    const up = css('--up') || '#16c784';
    const down = css('--down') || '#ea3943';
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: css('--muted') || '#8a94a6', fontFamily: 'inherit', attributionLogo: true },
      grid: { vertLines: { visible: false }, horzLines: { color: css('--line') || 'rgba(128,128,128,.15)' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      localization: { priceFormatter: (p: number) => formatPrice(p) },
    });
    candles.current = c.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderVisible: false,
      wickUpColor: up,
      wickDownColor: down,
      priceFormat: { type: 'custom', formatter: (p: number) => formatPrice(p), minMove: 1e-12 },
    });
    volume.current = c.addSeries(HistogramSeries, { priceScaleId: '', priceFormat: { type: 'volume' } });
    volume.current.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
    };
  }, [scheme]);

  useEffect(() => {
    if (!candles.current || !volume.current) return;
    const up = css('--up-a') || 'rgba(22,199,132,.45)';
    const down = css('--down-a') || 'rgba(234,57,67,.45)';
    candles.current.setData(data.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    volume.current.setData(data.map((d) => ({ time: d.time, value: d.volume, color: d.buyVol * 2 >= d.volume ? up : down })));
    chart.current?.timeScale().fitContent();
  }, [data, scheme]);

  return <div className="chart" ref={el} />;
}
