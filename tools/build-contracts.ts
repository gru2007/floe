import { buildAll } from '@ton/blueprint';

// Use Blueprint's public API without opening an interactive terminal in CI.
buildAll().then(() => console.log('Factory, Token and JettonWallet compiled successfully.')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
