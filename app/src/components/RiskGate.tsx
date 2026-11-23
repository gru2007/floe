import { useState } from 'react';
import { IconWarning } from '../icons';

const KEY = 'floe:risk-accepted:v1';

export function riskAccepted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** First-run disclosure. Required before any on-chain action (create / buy / sell). */
export function RiskGate({ onAccept, onCancel }: { onAccept: () => void; onCancel?: () => void }) {
  const [adult, setAdult] = useState(false);
  const [risk, setRisk] = useState(false);
  return (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="risk-title">
        <div className="risk-icon"><IconWarning size={28} /></div>
        <h3 id="risk-title">Прежде чем начать</h3>
        <ul className="risk-list">
          <li>Мем-токены — экспериментальные цифровые активы <b>без внутренней ценности</b>. Цена может упасть до нуля.</li>
          <li>Floe — программное обеспечение: мы не храним ваши средства, не даём советов и <b>не обещаем доход</b>. Токены создают пользователи; Floe не проверяет их и не отвечает за них.</li>
          <li>Каждая операция — транзакция в блокчейне TON, которую вы подписываете в своём кошельке. Её нельзя отменить.</li>
          <li>Не используйте сервис, если это запрещено законодательством вашей страны.</li>
        </ul>
        <label className="check">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          <span>Мне исполнилось 18 лет</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={risk} onChange={(e) => setRisk(e.target.checked)} />
          <span>Я понимаю риски и могу потерять все вложенные средства</span>
        </label>
        <div className="row gap">
          {onCancel && (
            <button className="btn -secondary" onClick={onCancel}>Отмена</button>
          )}
          <button
            className="btn"
            disabled={!adult || !risk}
            onClick={() => {
              try {
                localStorage.setItem(KEY, '1');
              } catch {
                /* ignore */
              }
              onAccept();
            }}
          >
            Продолжить
          </button>
        </div>
      </div>
    </div>
  );
}
