(function () {
  const SERVICE_FEE_RATE = 0.10;
  const PUBLISHER_FEE_RATE = 0.05;
  const WORKER_FEE_RATE = 0.05;

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function makeTransactionId(providerId) {
    const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
    return `${providerId.toUpperCase()}_${Date.now()}_${suffix}`;
  }

  function simulateSuccess(providerId) {
    return new Promise((resolve) => {
      window.setTimeout(() => {
        resolve({
          success: true,
          transactionId: makeTransactionId(providerId),
          paidAt: new Date().toISOString(),
        });
      }, 650);
    });
  }

  const providers = {
    sandbox: {
      id: "sandbox",
      name: "沙箱支付",
      icon: "shield",
      qr: false,
      simulated: true,
      description: "本地演示支付，点击后模拟成功，不需要真实商户配置。",
      create() {
        return {
          providerId: "sandbox",
          status: "ready",
          simulated: true,
        };
      },
      confirm() {
        return simulateSuccess("sandbox");
      },
    },
    wechat: {
      id: "wechat",
      name: "微信支付",
      icon: "credit-card",
      qr: true,
      simulated: true,
      description: "生产环境需后端创建微信 Native 预支付单并返回 code_url。",
      create() {
        // 生产环境示例：
        // return fetch("/api/payment/wechat/create", {
        //   method: "POST",
        //   headers: { "Content-Type": "application/json" },
        //   body: JSON.stringify(order),
        // }).then((res) => res.json());
        return {
          providerId: "wechat",
          status: "pending",
          simulated: true,
        };
      },
      confirm() {
        // 生产环境示例：
        // return poll("/api/payment/wechat/query", { transactionId: payment.transactionId });
        return simulateSuccess("wechat");
      },
    },
    alipay: {
      id: "alipay",
      name: "支付宝",
      icon: "wallet",
      qr: true,
      simulated: true,
      description: "生产环境需后端调用支付宝当面付并返回 qr_code。",
      create() {
        return {
          providerId: "alipay",
          status: "pending",
          simulated: true,
        };
      },
      confirm() {
        return simulateSuccess("alipay");
      },
    },
  };

  window.FriesPay = {
    SERVICE_FEE_RATE,
    PUBLISHER_FEE_RATE,
    WORKER_FEE_RATE,
    roundMoney,
    calculateFee(price) {
      const amount = Number(price) || 0;
      return {
        amount: roundMoney(amount),
        publisherFee: roundMoney(amount * PUBLISHER_FEE_RATE),
        workerFee: roundMoney(amount * WORKER_FEE_RATE),
        serviceFee: roundMoney(amount * SERVICE_FEE_RATE),
        publisherPays: roundMoney(amount * (1 + PUBLISHER_FEE_RATE)),
        workerIncome: roundMoney(amount * (1 - WORKER_FEE_RATE)),
      };
    },
    getProviders() {
      return Object.values(providers);
    },
    getProvider(id) {
      return providers[id] || providers.sandbox;
    },
    createPayment(providerId, order) {
      const provider = this.getProvider(providerId);
      return Promise.resolve(provider.create(order));
    },
    confirmPayment(providerId, payment, order) {
      const provider = this.getProvider(providerId);
      return Promise.resolve(provider.confirm(payment, order));
    },
  };
})();
