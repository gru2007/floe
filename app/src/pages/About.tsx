import { useConfig } from '../ctx';
import { fmtAddress } from '../lib/config';
import { SettingsLogo } from '../components/SettingsLogo';
import { FloeLogo, IconShield, IconChart, IconLock, IconWarning, IconCoins, IconExternal } from '../icons';

export function About() {
  const cfg = useConfig();
  return (
    <div className="page about">
      <header className="about-head">
        <SettingsLogo size={56} />
        <h1>Floe</h1>
        <p className="muted">Некастодиальный лаунчпад мем-токенов в сети TON</p>
      </header>

      <section className="card">
        <h2><IconChart size={18} /> Как это работает</h2>
        <ol className="steps">
          <li><b>Создание.</b> Вы задаёте название, тикер, логотип, эмиссию, стартовую капитализацию, крутизну кривой, комиссию автора и лимит покупки. Контракт-фабрика разворачивает токен (стандарт TEP-74).</li>
          <li><b>Торговля.</b> Цена задаётся формулой (bonding curve с виртуальными резервами). Покупка выпускает токены, продажа сжигает их и возвращает TON из резерва кривой. Контрагент — смарт-контракт, а не Floe.</li>
          <li><b>График.</b> Каждая сделка пишет событие в блокчейн; приложение строит свечи прямо из этих событий через публичный индексатор — без собственных серверов.</li>
        </ol>
      </section>

      <section className="card">
        <h2><IconShield size={18} /> Гарантии контракта</h2>
        <ul className="plain">
          <li><IconLock size={16} /> У токена нет администратора и функции выпуска: нельзя «допечатать» токены.</li>
          <li><IconLock size={16} /> Параметры кривой и метаданные неизменяемы после запуска.</li>
          <li><IconLock size={16} /> Резерв TON учитывается отдельно; округление всегда в пользу резерва, поэтому продать обратно может каждый держатель.</li>
          <li><IconLock size={16} /> Floe не хранит ваши средства и ключи: всё подписывается в вашем TON-кошельке через TON Connect.</li>
        </ul>
      </section>

      <section className="card">
        <h2><IconCoins size={18} /> Комиссии</h2>
        <ul className="plain">
          <li>Создание токена — фиксированная плата фабрики + депозит хранения 0.1 TON (остаётся на контракте токена) + газ сети.</li>
          <li>Каждая сделка — комиссия автора токена (0–5%, задаёт автор) и комиссия платформы (до 2%). Обе видны до подтверждения.</li>
          <li>Газ сети: ~0.05 TON прикладывается к покупке и ~0.06 TON к продаже, неиспользованная часть возвращается.</li>
        </ul>
      </section>

      <section className="card -warn">
        <h2><IconWarning size={18} /> Риски и условия</h2>
        <ul className="plain">
          <li>Мем-токены не имеют внутренней ценности и не являются ценными бумагами, долей или инвестиционным предложением. Цена может упасть до нуля.</li>
          <li>Токены создают пользователи. Floe их не проверяет, не рекомендует и не отвечает за действия их авторов. Будьте осторожны с подделками известных проектов.</li>
          <li>Транзакции в блокчейне необратимы. Ошибки в адресе или сумме исправить нельзя.</li>
          <li>Сервис только для лиц старше 18 лет. Не используйте его, если это запрещено в вашей юрисдикции.</li>
          <li>Программное обеспечение предоставляется «как есть», без гарантий. Используя Floe, вы принимаете эти условия.</li>
          <li>Конфиденциальность: у Floe нет сервера и базы данных. Мы не собираем персональные данные. Публичные данные блокчейна запрашиваются у toncenter.com, курс TON — у tonapi.io.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Контракты</h2>
        <div className="kv"><span>Сеть</span><b>{cfg.isTestnet ? 'TON Testnet' : 'TON Mainnet'}</b></div>
        {cfg.factories.map((f) => {
          const a = fmtAddress(f, cfg.isTestnet);
          return (
            <div className="kv" key={a}>
              <span>Фабрика</span>
              <a className="mono" href={`https://${cfg.isTestnet ? 'testnet.' : ''}tonviewer.com/${a}`} target="_blank" rel="noopener noreferrer">
                {a.slice(0, 6)}…{a.slice(-6)} <IconExternal size={14} />
              </a>
            </div>
          );
        })}
        {cfg.floe.sourceUrl && <a className="btn -secondary -wide" href={cfg.floe.sourceUrl} target="_blank" rel="noopener noreferrer">Исходный код (FunC)</a>}
        {cfg.floe.supportUrl && <a className="btn -secondary -wide" href={cfg.floe.supportUrl} target="_blank" rel="noopener noreferrer">Поддержка и жалобы на токены</a>}
      </section>
    </div>
  );
}
