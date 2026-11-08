export const CONFIG = {
  APP_NAME: "Cazino Mini App",
  // URL приложения (для продакшена задается через VITE_APP_URL, локально - пусто)
  APP_URL: import.meta.env.VITE_APP_URL || "", 
  // TON кошелек для приема платежей (задается через VITE_TON_WALLET)
  TON_WALLET: import.meta.env.VITE_TON_WALLET || "", 
  // Сумма пополнения за 1 клик (для теста)
  TOP_UP_AMOUNT_TON: 1, 
  // URL API сервера (если пусто, будет использоваться текущий домен)
  API_URL: import.meta.env.VITE_API_URL || "" 
};
