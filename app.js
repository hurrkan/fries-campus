(function () {
  "use strict";

  const STORAGE_KEY = "fries-campus-platform-v2";
  const ADMIN_PASSWORD = null;
  const SERVICE_FEE_RATE = FriesPay.SERVICE_FEE_RATE;
  const SERVER_BASE = "https://fries-cus-admin-fries-c-service-phxyhytfad.cn-beijing.fcapp.run";
  const SESSION_TOKEN_KEY = "fries-campus-session-token";
  let sessionToken = localStorage.getItem(SESSION_TOKEN_KEY) || "";
  let serverStateReady = false;
  let syncTimer = null;
  let syncChain = Promise.resolve();

  const CAMPUSES = [
    { id: "shaziao", name: "砂子坳校区", short: "砂子坳" },
    { id: "datianwan", name: "大田湾校区", short: "大田湾" },
    { id: "leigongjing", name: "雷公井校区", short: "雷公井" },
    { id: "zhangjiajie", name: "张家界校区", short: "张家界" },
  ];

  const STATUS_META = {
    open: { label: "待接单", className: "status-open" },
    progress: { label: "进行中", className: "status-progress" },
    submitted: { label: "待确认", className: "status-submitted" },
    completed: { label: "已完成", className: "status-completed" },
    cancelled: { label: "已取消", className: "status-cancelled" },
  };

  const STATUS_FILTERS = [
    { id: "all", label: "全部" },
    { id: "open", label: "待接单" },
    { id: "progress", label: "进行中" },
    { id: "submitted", label: "待确认" },
    { id: "completed", label: "已完成" },
  ];

  const CERT_STATUS_META = {
    none: { label: "未认证", className: "cert-none" },
    pending: { label: "审核中", className: "cert-pending" },
    approved: { label: "已认证", className: "cert-approved" },
    rejected: { label: "已驳回", className: "cert-rejected" },
    revoked: { label: "已取消", className: "cert-revoked" },
  };

  const RECHARGE_GIFTS = [
    { min: 500, gift: 60 },
    { min: 200, gift: 20 },
    { min: 100, gift: 8 },
    { min: 50, gift: 3 },
  ];

  const AVATAR_COLORS = [
    "#16865f",
    "#2c6fbb",
    "#ef5b3f",
    "#b35c00",
    "#6b5bd2",
    "#0f8a9d",
    "#b83255",
    "#547e20",
  ];

  const state = {
    currentUserId: "me",
    users: [],
    certifications: [],
    orders: [],
    filters: { campus: "all", status: "all", search: "" },
    mineTab: "all",
    adminAuthed: false,
    adminTab: "users",
    adminSearch: "",
    activeOrderId: null,
    modalActions: [],
    payment: null,
    publishCampus: "shaziao",
    selectedRechargeAmount: 100,
  };

  const loaded = loadState();
  state.users = loaded.users;
  state.certifications = loaded.certifications;
  state.orders = loaded.orders;

  const dom = {
    campusFilters: document.getElementById("campusFilters"),
    statusFilters: document.getElementById("statusFilters"),
    overviewStats: document.getElementById("overviewStats"),
    feedTitle: document.getElementById("feedTitle"),
    orderList: document.getElementById("orderList"),
    emptyState: document.getElementById("emptyState"),
    searchInput: document.getElementById("searchInput"),
    clearFilters: document.getElementById("clearFilters"),
    publishForm: document.getElementById("publishForm"),
    campusPicker: document.getElementById("campusPicker"),
    campus: document.getElementById("campus"),
    orderDate: document.getElementById("orderDate"),
    orderTime: document.getElementById("orderTime"),
    price: document.getElementById("price"),
    previewOrderAmount: document.getElementById("previewOrderAmount"),
    previewServiceFee: document.getElementById("previewServiceFee"),
    previewTotal: document.getElementById("previewTotal"),
    previewWorkerIncome: document.getElementById("previewWorkerIncome"),
    fillInfoBook: document.getElementById("fillInfoBook"),
    certPanel: document.getElementById("certPanel"),
    infoBookBar: document.getElementById("infoBookBar"),
    mineBalance: document.getElementById("mineBalance"),
    minePendingAmount: document.getElementById("minePendingAmount"),
    mineEarnedAmount: document.getElementById("mineEarnedAmount"),
    mineCertStatus: document.getElementById("mineCertStatus"),
    mineOrderList: document.getElementById("mineOrderList"),
    mineEmptyState: document.getElementById("mineEmptyState"),
    openRecharge: document.getElementById("openRecharge"),
    openWithdraw: document.getElementById("openWithdraw"),
    topBalanceChip: document.getElementById("topBalanceChip"),
    topBalanceValue: document.getElementById("topBalanceValue"),
    adminBtn: document.getElementById("adminBtn"),
    adminLogout: document.getElementById("adminLogout"),
    adminTabs: document.getElementById("adminTabs"),
    adminSearch: document.getElementById("adminSearch"),
    adminContent: document.getElementById("adminContent"),
    mobileMenuBtn: document.getElementById("mobileMenuBtn"),
    modalBackdrop: document.getElementById("modalBackdrop"),
    modalKicker: document.getElementById("modalKicker"),
    modalTitle: document.getElementById("modalTitle"),
    modalBody: document.getElementById("modalBody"),
    modalFooter: document.getElementById("modalFooter"),
    modalClose: document.getElementById("modalClose"),
    toast: document.getElementById("toast"),
  };

  let certFileDataUrl = null;
  let evidenceFileDataUrl = null;

  init();
  bootstrapFromServer();
  window.setInterval(function () {
    if (serverStateReady && document.visibilityState === "visible" && dom.modalBackdrop.hidden) {
      bootstrapFromServer(true);
    }
  }, 25000);

  function init() {
    dom.orderDate.min = localISODate(0);
    dom.orderTime.value = "08:00";
    renderCampusPicker();
    renderCampusFilters();
    renderStatusFilters();
    renderTopBalance();
    renderCertPanel();
    renderInfoBookBar();
    updateFeePreview();
    switchView("home");
    bindEvents();
  }

  function bindEvents() {
    document.addEventListener("click", handleGlobalClick);
    document.addEventListener("submit", handleFormSubmit);
    document.addEventListener("change", handleFileChange);

    dom.searchInput.addEventListener("input", () => {
      state.filters.search = dom.searchInput.value;
      renderFeed();
    });

    dom.clearFilters.addEventListener("click", () => {
      state.filters = { campus: "all", status: "all", search: "" };
      dom.searchInput.value = "";
      renderCampusFilters();
      renderStatusFilters();
      renderFeed();
    });

    dom.price.addEventListener("input", updateFeePreview);
    dom.fillInfoBook.addEventListener("click", applyInfoBookToPublish);
    dom.openRecharge.addEventListener("click", openRechargeModal);
    dom.openWithdraw.addEventListener("click", openWithdrawModal);
    if (dom.adminBtn) {
      dom.adminBtn.addEventListener("click", () => {
        if (state.adminAuthed) {
          switchView("admin");
        } else {
          openAdminLogin();
        }
      });
    }
    if (dom.adminLogout) {
      dom.adminLogout.addEventListener("click", () => {
        state.adminAuthed = false;
        toast("已退出管理员后台");
        switchView("home");
      });
    }
    if (dom.adminSearch) {
      dom.adminSearch.addEventListener("input", () => {
        state.adminSearch = dom.adminSearch.value;
        renderAdmin();
      });
    }
    dom.topBalanceChip.addEventListener("click", () => switchView("mine"));
    dom.mobileMenuBtn.addEventListener("click", () => {
      document.querySelector(".main-nav").classList.toggle("is-open");
    });
    dom.modalClose.addEventListener("click", closeModal);
    dom.modalBackdrop.addEventListener("click", (event) => {
      if (event.target === dom.modalBackdrop) {
        closeModal();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !dom.modalBackdrop.hidden) {
        closeModal();
      }
    });
  }

  function handleGlobalClick(event) {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      switchView(viewButton.dataset.view);
      document.querySelector(".main-nav").classList.remove("is-open");
      return;
    }

    const campusChip = event.target.closest("[data-campus]");
    if (campusChip) {
      state.filters.campus = campusChip.dataset.campus;
      renderCampusFilters();
      renderFeed();
      return;
    }

    const statusChip = event.target.closest("[data-status]");
    if (statusChip) {
      state.filters.status = statusChip.dataset.status;
      renderStatusFilters();
      renderFeed();
      return;
    }

    const mineTab = event.target.closest("[data-mine-tab]");
    if (mineTab) {
      state.mineTab = mineTab.dataset.mineTab;
      document.querySelectorAll("[data-mine-tab]").forEach((tab) => {
        tab.classList.toggle("is-active", tab.dataset.mineTab === state.mineTab);
      });
      renderMine();
      return;
    }

    const adminTab = event.target.closest("[data-admin-tab]");
    if (adminTab) {
      state.adminTab = adminTab.dataset.adminTab;
      renderAdmin();
      return;
    }

    const campusOption = event.target.closest("[data-campus-option]");
    if (campusOption) {
      state.publishCampus = campusOption.dataset.campusOption;
      dom.campus.value = state.publishCampus;
      renderCampusPicker();
      return;
    }

    const paymentMethod = event.target.closest("[data-payment-method]");
    if (paymentMethod) {
      selectPaymentProvider(paymentMethod.dataset.paymentMethod);
      return;
    }

    const rechargeAmount = event.target.closest("[data-recharge-amount]");
    if (rechargeAmount) {
      selectRechargeAmount(Number(rechargeAmount.dataset.rechargeAmount));
      return;
    }

    const copyButton = event.target.closest("[data-copy-text]");
    if (copyButton) {
      copyText(copyButton.dataset.copyText);
      return;
    }

    const infoBookAction = event.target.closest("[data-info-book-action]");
    if (infoBookAction) {
      if (infoBookAction.dataset.infoBookAction === "viewCert") {
        openCertDetailModal(latestCertificationForUser(currentUser().id));
      } else {
        openInfoBookModal();
      }
      return;
    }

    const orderAction = event.target.closest("[data-order-action]");
    if (orderAction) {
      handleOrderAction(orderAction.dataset.orderAction, orderAction.dataset.id);
      return;
    }

    const adminAction = event.target.closest("[data-admin-action]");
    if (adminAction) {
      handleAdminAction(adminAction.dataset.adminAction, adminAction.dataset.id);
      return;
    }

    const modalAction = event.target.closest("[data-modal-action]");
    if (modalAction) {
      const action = state.modalActions.find((item) => item.id === modalAction.dataset.modalAction);
      if (action && !modalAction.disabled) {
        action.onClick(modalAction);
      }
    }
  }

  function switchView(view) {
    if (view === "admin" && !state.adminAuthed) {
      openAdminLogin();
      return;
    }

    document.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === view);
    });
    document.querySelectorAll("[data-view-panel]").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.viewPanel === view);
    });

    if (view === "home") {
      renderFeed();
    }
    if (view === "cert") {
      renderCertPanel();
    }
    if (view === "mine") {
      renderMine();
      renderInfoBookBar();
    }
    if (view === "admin") {
      renderAdmin();
    }
    if (view === "publish") {
      renderCampusPicker();
      updateFeePreview();
    }
    renderTopBalance();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderCampusPicker() {
    dom.campusPicker.innerHTML = CAMPUSES.map(
      (campus) => `
        <button class="campus-option ${state.publishCampus === campus.id ? "is-active" : ""}" type="button" data-campus-option="${campus.id}">
          <span class="campus-option-icon">${icon("building")}</span>
          <span class="campus-option-copy">
            <strong>${escapeHtml(campus.short)}</strong>
            <small>${escapeHtml(campus.name)}</small>
          </span>
          ${state.publishCampus === campus.id ? `<span class="campus-option-check">${icon("check")}</span>` : ""}
        </button>
      `
    ).join("");
    dom.campus.value = state.publishCampus;
  }

  function renderCampusFilters() {
    const allActive = state.filters.campus === "all";
    dom.campusFilters.innerHTML = [
      `<button class="chip ${allActive ? "is-active" : ""}" type="button" data-campus="all">全部</button>`,
      ...CAMPUSES.map(
        (campus) =>
          `<button class="chip ${state.filters.campus === campus.id ? "is-active" : ""}" type="button" data-campus="${campus.id}">${escapeHtml(campus.short)}</button>`
      ),
    ].join("");
  }

  function renderStatusFilters() {
    dom.statusFilters.innerHTML = STATUS_FILTERS.map(
      (status) =>
        `<button class="chip ${state.filters.status === status.id ? "is-active" : ""}" type="button" data-status="${status.id}">${escapeHtml(status.label)}</button>`
    ).join("");
  }

  function renderTopBalance() {
    dom.topBalanceValue.textContent = formatMoney(currentUser().balance);
  }

  function renderOverviewStats() {
    const openCount = state.orders.filter((order) => order.status === "open").length;
    const today = localISODate(0);
    const todayCount = state.orders.filter((order) => order.createdDate === today).length;
    const openOrders = state.orders.filter((order) => order.status === "open");
    const average = openOrders.length
      ? openOrders.reduce((sum, order) => sum + Number(order.price), 0) / openOrders.length
      : 0;

    dom.overviewStats.innerHTML = [
      statCell(String(openCount), "当前待接单"),
      statCell(String(todayCount), "今日新增"),
      statCell(`¥${average.toFixed(1)}`, "平均报酬"),
      statCell("7%", "平台服务费"),
    ].join("");
  }

  function statCell(value, label) {
    return `<div class="stat-cell"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
  }

  function renderFeed() {
    const orders = getFilteredOrders();
    const campusName =
      state.filters.campus === "all"
        ? "全部校区"
        : campusById(state.filters.campus)?.short || "全部校区";
    dom.feedTitle.textContent = campusName;
    dom.orderList.innerHTML = orders.map((order) => renderOrderCard(order, "market")).join("");
    dom.emptyState.hidden = orders.length > 0;
  }

  function getFilteredOrders() {
    const term = state.filters.search.trim().toLowerCase();
    return state.orders
      .filter((order) => {
        if (state.filters.campus !== "all" && order.campusId !== state.filters.campus) {
          return false;
        }
        if (state.filters.status !== "all" && order.status !== state.filters.status) {
          return false;
        }
        if (!term) {
          return true;
        }
        const haystack = [
          order.course,
          order.type,
          order.location,
          order.posterName,
          order.workerName || "",
          campusById(order.campusId)?.name || "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function renderOrderCard(order, mode) {
    const status = STATUS_META[order.status] || STATUS_META.open;
    const isMinePoster = order.posterId === state.currentUserId;
    const isMineWorker = order.workerId === state.currentUserId;
    const involved = isMinePoster || isMineWorker;
    const posterName = isMinePoster ? "我" : order.posterName;
    const workerName = isMineWorker ? "我" : order.workerName || "暂无";
    const actions = [];

    actions.push({
      id: "detail",
      label: "详情",
      icon: "eye",
      variant: "button-ghost",
      action: "detail",
    });

    if (mode === "market") {
      if (order.status === "open" && !isMinePoster) {
        actions.push({
          id: "accept",
          label: "接单",
          icon: "check",
          variant: "button-primary",
          action: "accept",
        });
      }
      if (order.status === "progress" && isMineWorker) {
        actions.push({
          id: "submit",
          label: "上传凭证",
          icon: "upload",
          variant: "button-primary",
          action: "submit",
        });
      }
      if (order.status === "submitted" && isMinePoster) {
        actions.push({
          id: "confirm",
          label: "确认收货",
          icon: "check-circle",
          variant: "button-primary",
          action: "confirm",
        });
      }
    }

    if (mode === "mine") {
      if (order.status === "open" && isMinePoster) {
        actions.push({
          id: "cancel",
          label: "取消退款",
          icon: "x",
          variant: "button-danger",
          action: "cancel",
        });
      }
      if (order.status === "progress" && isMineWorker) {
        actions.push({
          id: "submit",
          label: "上传凭证",
          icon: "upload",
          variant: "button-primary",
          action: "submit",
        });
      }
      if (order.status === "submitted" && isMinePoster) {
        actions.push({
          id: "confirm",
          label: "确认收货",
          icon: "check-circle",
          variant: "button-primary",
          action: "confirm",
        });
      }
    }

    const actionHtml = actions
      .map(
        (action) =>
          `<button class="button ${action.variant}" type="button" data-order-action="${action.action}" data-id="${order.id}">${icon(action.icon)}<span>${escapeHtml(action.label)}</span></button>`
      )
      .join("");

    return `
      <article class="order-card">
        <div class="order-main">
          <div class="order-topline">
            <span class="type-badge">${escapeHtml(order.type)}</span>
            <span class="status-badge ${status.className}">${escapeHtml(status.label)}</span>
          </div>
          <h3 class="order-title">${escapeHtml(order.course)}</h3>
          <div class="order-meta">
            <span class="meta-item">${icon("map-pin")}<span>${escapeHtml(campusById(order.campusId)?.short || "未知校区")} · ${escapeHtml(order.location)}</span></span>
            <span class="meta-item">${icon("clock")}<span>${escapeHtml(formatDateCN(order.date))} ${escapeHtml(order.time)}</span></span>
          </div>
          <p class="order-notes">${order.notes ? escapeHtml(order.notes) : "无备注"}</p>
        </div>
        <div class="order-side">
          <div class="order-side-top">
            <p class="price">¥${Number(order.price).toFixed(2)}</p>
            <span class="poster">${avatar(order.posterId, posterName)}${escapeHtml(posterName)} 发布</span>
            ${involved && order.workerId ? `<span class="poster">${avatar(order.workerId, workerName)}${escapeHtml(workerName)} 接单</span>` : ""}
          </div>
          <div class="card-actions">${actionHtml}</div>
        </div>
      </article>
    `;
  }

  function handleOrderAction(action, id) {
    const order = state.orders.find((item) => item.id === id);
    if (!order) {
      return;
    }

    if (action === "detail") {
      openDetailModal(id);
    }
    if (action === "accept") {
      acceptOrder(id);
    }
    if (action === "submit") {
      openEvidenceModal(id);
    }
    if (action === "confirm") {
      confirmReceipt(id);
    }
    if (action === "cancel") {
      cancelOrder(id);
    }
  }

  function openDetailModal(id) {
    const order = state.orders.find((item) => item.id === id);
    if (!order) {
      return;
    }

    state.activeOrderId = id;
    const fee = FriesPay.calculateFee(order.price);
    const isMinePoster = order.posterId === state.currentUserId;
    const isMineWorker = order.workerId === state.currentUserId;
    const involved = isMinePoster || isMineWorker;
    const contact = involved ? order.contact : "接单后可见";
    const status = STATUS_META[order.status] || STATUS_META.open;
    const evidence = order.evidence;

    const body = `
      <div class="detail-section">
        <h3>订单信息</h3>
        <dl class="detail-list">
          ${detailRow("课程", order.course)}
          ${detailRow("类型", order.type)}
          ${detailRow("校区", campusById(order.campusId)?.name || "未知校区")}
          ${detailRow("地点", order.location)}
          ${detailRow("时间", `${formatDateCN(order.date)} ${order.time}`)}
          ${detailRow("状态", status.label)}
          ${detailRow("发布人", isMinePoster ? "我" : order.posterName)}
          ${detailRow("接单人", order.workerId ? (isMineWorker ? "我" : order.workerName) : "暂未接单")}
          ${detailRow("联系方式", contact)}
        </dl>
      </div>
      ${order.notes ? `<div class="detail-section"><h3>备注要求</h3><p class="order-notes">${escapeHtml(order.notes)}</p></div>` : ""}
      ${
        evidence
          ? `<div class="detail-section"><h3>完成凭证</h3><div class="evidence-preview"><img src="${evidence.fileDataUrl}" alt="完成凭证"><div><strong>已上传</strong><p>${escapeHtml(evidence.note || "无补充说明")}</p></div></div></div>`
          : ""
      }
      <div class="detail-section">
        <h3>费用与结算</h3>
        <div class="fee-breakdown">
          <div class="fee-line"><span>订单金额</span><strong>${formatMoney(fee.amount)}</strong></div>
          <div class="fee-line"><span>平台服务费（7%）</span><strong>-${formatMoney(fee.serviceFee)}</strong></div>
          <div class="fee-line fee-highlight"><span>接单方到账</span><strong>${formatMoney(fee.workerIncome)}</strong></div>
        </div>
        <p class="payment-note">接单方上传凭证并由发单方确认收货后，${formatMoney(fee.workerIncome)} 才会进入接单方余额。</p>
      </div>
    `;

    const actions = [{ id: "close", label: "关闭", icon: "x", variant: "button-ghost", onClick: closeModal }];

    if (order.status === "open" && !isMinePoster) {
      actions.push({
        id: "accept",
        label: "确认接单",
        icon: "check",
        variant: "button-primary",
        onClick: () => acceptOrder(id),
      });
    }

    if (order.status === "open" && isMinePoster) {
      actions.push({
        id: "cancel",
        label: "取消并退款",
        icon: "x",
        variant: "button-danger",
        onClick: () => cancelOrder(id),
      });
    }

    if (order.status === "progress" && isMineWorker) {
      actions.push({
        id: "submit",
        label: "上传完成凭证",
        icon: "upload",
        variant: "button-primary",
        onClick: () => openEvidenceModal(id),
      });
    }

    if (order.status === "submitted" && isMinePoster) {
      actions.push({
        id: "confirm",
        label: "确认收货",
        icon: "check-circle",
        variant: "button-primary",
        onClick: () => confirmReceipt(id),
      });
    }

    openModal(order.course, "ORDER DETAIL", body, actions);
  }

  function detailRow(label, value) {
    return `<div class="detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  }

  function acceptOrder(id) {
    const order = state.orders.find((item) => item.id === id);
    if (!order || order.status !== "open") {
      toast("该订单当前不可接单");
      return;
    }
    if (order.posterId === state.currentUserId) {
      toast("不能接自己发布的订单");
      return;
    }
    if (currentUser().certificationStatus !== "approved") {
      closeModal();
      toast("请先完成接单员认证并通过管理员审核");
      switchView("cert");
      return;
    }

    order.workerId = state.currentUserId;
    order.workerName = currentUser().name;
    order.status = "progress";
    order.acceptedAt = new Date().toISOString();
    saveState();
    closeModal();
    toast("接单成功，完成后请上传凭证");
    renderAll();
  }

  function openEvidenceModal(id) {
    const order = state.orders.find((item) => item.id === id);
    if (!order || order.status !== "progress" || order.workerId !== state.currentUserId) {
      toast("只有接单方可以在进行中上传完成凭证");
      return;
    }
    state.activeOrderId = id;
    evidenceFileDataUrl = null;
    const body = `
      <form id="evidenceForm">
        <div class="field">
          <span>完成凭证照片</span>
          <label class="upload-box">
            <input type="file" accept="image/*" data-file-role="evidence" required>
            <span class="upload-icon">${icon("upload")}</span>
            <strong>点击选择照片</strong>
            <small>建议上传签到码、课堂照片或老师确认截图</small>
          </label>
          <div class="photo-preview" id="evidencePreview" hidden></div>
        </div>
        <label class="field">
          <span>补充说明</span>
          <textarea id="evidenceNote" rows="3" placeholder="例如：已完成签到，附上照片。"></textarea>
        </label>
      </form>
    `;

    openModal("上传完成凭证", "ORDER EVIDENCE", body, [
      { id: "cancel", label: "取消", icon: "x", variant: "button-ghost", onClick: closeModal },
      {
        id: "submitEvidence",
        label: "提交凭证",
        icon: "check",
        variant: "button-primary",
        onClick: () => {
          const form = document.getElementById("evidenceForm");
          if (form && form.reportValidity()) {
            handleEvidenceSubmit();
          }
        },
      },
    ]);
  }

  function handleEvidenceSubmit() {
    const order = state.orders.find((item) => item.id === state.activeOrderId);
    if (!order || !evidenceFileDataUrl) {
      toast("请上传完成凭证照片");
      return;
    }
    order.status = "submitted";
    order.evidence = {
      fileDataUrl: evidenceFileDataUrl,
      note: document.getElementById("evidenceNote")?.value.trim() || "",
      submittedAt: new Date().toISOString(),
    };
    evidenceFileDataUrl = null;
    saveState();
    closeModal();
    toast("凭证已提交，等待发单方确认收货");
    renderAll();
  }

  function confirmReceipt(id) {
    const order = state.orders.find((item) => item.id === id);
    if (!order || order.status !== "submitted" || order.posterId !== state.currentUserId) {
      toast("只有发单方可以确认该订单");
      return;
    }
    const fee = FriesPay.calculateFee(order.price);
    order.status = "completed";
    order.completedAt = new Date().toISOString();
    creditUserBalance(order.workerId, fee.workerIncome);
    saveState();
    closeModal();
    toast(`已确认收货，接单方收入 ${formatMoney(fee.workerIncome)} 已入余额`);
    renderAll();
  }

  function cancelOrder(id) {
    const order = state.orders.find((item) => item.id === id);
    if (!order || order.status !== "open" || order.posterId !== state.currentUserId) {
      toast("只能取消自己发布的待接订单");
      return;
    }

    order.status = "cancelled";
    order.cancelledAt = new Date().toISOString();
    if (order.payment?.providerId === "balance") {
      creditUserBalance(order.posterId, Number(order.price));
    }
    saveState();
    closeModal();
    toast("订单已取消，支付金额已退回");
    renderAll();
  }

  function handlePublishSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const price = Number(dom.price.value);
    if (!Number.isFinite(price) || price <= 0) {
      toast("请填写有效的代课报酬");
      return;
    }
    if (!form.reportValidity()) {
      return;
    }

    const draft = {
      course: document.getElementById("courseName").value.trim(),
      type: document.getElementById("orderType").value,
      campusId: state.publishCampus,
      location: document.getElementById("location").value.trim(),
      date: dom.orderDate.value,
      time: dom.orderTime.value,
      price,
      notes: document.getElementById("notes").value.trim(),
      contact: document.getElementById("contact").value.trim(),
    };

    openPaymentModal({
      purpose: "order",
      amount: price,
      draft,
      onSuccess(result, providerId) {
        createOrderFromDraft(draft, result, providerId);
      },
    });
  }

  function createOrderFromDraft(draft, paymentResult, providerId) {
    const order = {
      id: generateId(),
      type: draft.type,
      course: draft.course,
      campusId: draft.campusId,
      location: draft.location,
      date: draft.date,
      time: draft.time,
      price: draft.price,
      notes: draft.notes,
      contact: draft.contact,
      posterId: state.currentUserId,
      posterName: currentUser().name,
      workerId: null,
      workerName: null,
      status: "open",
      createdDate: localISODate(0),
      createdAt: new Date().toISOString(),
      paid: true,
      payment: {
        providerId: providerId || "sandbox",
        transactionId: paymentResult.transactionId,
        paidAt: paymentResult.paidAt,
      },
    };

    state.orders.unshift(order);
    saveState();
    document.getElementById("publishForm").reset();
    dom.orderDate.min = localISODate(0);
    dom.orderTime.value = "08:00";
    state.publishCampus = "shaziao";
    updateFeePreview();
    switchView("home");
    renderOverviewStats();
    toast("发布成功，订单已进入大厅");
  }

  function openPaymentModal(options) {
    const isOrder = options.purpose === "order";
    const amount = Number(options.amount) || 0;
    const fee = isOrder ? FriesPay.calculateFee(amount) : null;
    const gift = isOrder ? 0 : giftForAmount(amount);
    const currentBalance = currentUser().balance;
    const paymentOptions = getPaymentProviderOptions(isOrder, amount);

    state.payment = {
      purpose: options.purpose,
      amount,
      draft: options.draft || null,
      onSuccess: options.onSuccess,
      selectedProvider: isOrder && currentBalance >= amount ? "balance" : "sandbox",
      confirming: false,
      meta: { gift },
    };

    const providerButtons = paymentOptions
      .map((provider) => {
        const disabled = provider.id === "balance" && currentBalance < amount;
        return `<button class="payment-method ${state.payment.selectedProvider === provider.id ? "is-active" : ""}" type="button" data-payment-method="${provider.id}" ${disabled ? "disabled" : ""}>${icon(provider.icon)}<span>${escapeHtml(provider.name)}</span></button>`;
      })
      .join("");

    const breakdown = isOrder
      ? `
        <div class="fee-line"><span>订单金额</span><strong>${formatMoney(fee.amount)}</strong></div>
        <div class="fee-line"><span>平台服务费（7%，从订单中扣除）</span><strong>-${formatMoney(fee.serviceFee)}</strong></div>
        <div class="fee-line fee-highlight"><span>接单方预计到账</span><strong>${formatMoney(fee.workerIncome)}</strong></div>
      `
      : `
        <div class="fee-line"><span>充值金额</span><strong>${formatMoney(amount)}</strong></div>
        <div class="fee-line"><span>本次赠送</span><strong>+${formatMoney(gift)}</strong></div>
        <div class="fee-line fee-highlight"><span>到账余额</span><strong>${formatMoney(amount + gift)}</strong></div>
      `;

    const body = `
      <div class="fee-breakdown">${breakdown}</div>
      <div class="detail-section">
        <h3>选择支付方式</h3>
        <div class="payment-methods">${providerButtons}</div>
        <div id="paymentArea">${renderPaymentArea(state.payment.selectedProvider)}</div>
      </div>
    `;

    openModal(isOrder ? "支付订单" : "余额充值", "PAYMENT", body, [
      { id: "cancel", label: "取消", icon: "x", variant: "button-ghost", onClick: closeModal },
      {
        id: "pay",
        label: state.payment.selectedProvider === "balance" ? "确认支付" : "模拟支付成功",
        icon: "check",
        variant: "button-primary",
        onClick: confirmPayment,
      },
    ]);
  }

  function getPaymentProviderOptions(isOrder, amount) {
    const providers = FriesPay.getProviders().map((provider) => ({
      id: provider.id,
      name: provider.name,
      icon: provider.icon,
      external: true,
    }));
    if (isOrder) {
      providers.unshift({
        id: "balance",
        name: "余额支付",
        icon: "wallet",
        external: false,
        disabled: currentUser().balance < amount,
      });
    }
    return providers;
  }

  function renderPaymentArea(providerId) {
    if (providerId === "balance") {
      return `<div class="payment-note">使用当前余额支付，支付后直接从余额扣除。当前余额 ${formatMoney(currentUser().balance)}。</div>`;
    }
    const provider = FriesPay.getProvider(providerId);
    if (!provider || !provider.qr) {
      return `<div class="payment-note">${escapeHtml(provider?.description || "沙箱支付")}</div>`;
    }
    return `
      <div class="qr-box"><span>${icon("scan")}</span></div>
      <p class="payment-caption">这是沙箱二维码，生产环境需替换为真实支付二维码。</p>
    `;
  }

  function selectPaymentProvider(providerId) {
    if (!state.payment) {
      return;
    }
    state.payment.selectedProvider = providerId;
    document.querySelectorAll("[data-payment-method]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.paymentMethod === providerId);
    });
    const area = document.getElementById("paymentArea");
    if (area) {
      area.innerHTML = renderPaymentArea(providerId);
    }
    const payAction = state.modalActions.find((action) => action.id === "pay");
    if (payAction) {
      const button = document.querySelector('[data-modal-action="pay"] span');
      if (button) {
        button.textContent = providerId === "balance" ? "确认支付" : "模拟支付成功";
      }
    }
  }

  async function confirmPayment(button) {
    if (!state.payment || state.payment.confirming) {
      return;
    }

    const payment = state.payment;
    const providerId = payment.selectedProvider;
    payment.confirming = true;
    setButtonBusy(button, true, "处理中...");

    try {
      let result;
      if (providerId === "balance") {
        if (currentUser().balance < payment.amount) {
          throw new Error("Insufficient balance");
        }
        currentUser().balance = FriesPay.roundMoney(currentUser().balance - payment.amount);
        result = {
          success: true,
          providerId: "balance",
          transactionId: `BALANCE_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          paidAt: new Date().toISOString(),
        };
      } else {
        const paymentInfo = await FriesPay.createPayment(providerId, payment.draft || { amount: payment.amount });
        result = await FriesPay.confirmPayment(providerId, paymentInfo, payment.draft || { amount: payment.amount });
      }

      if (!result || !result.success) {
        throw new Error("Payment failed");
      }

      const onSuccess = payment.onSuccess;
      const paidProviderId = providerId;
      saveState();
      closeModal();
      onSuccess(result, paidProviderId);
    } catch (error) {
      payment.confirming = false;
      setButtonBusy(button, false, providerId === "balance" ? "确认支付" : "模拟支付成功");
      toast(providerId === "balance" ? "余额不足，请先充值" : "支付失败，请稍后重试");
    }
  }

  function setButtonBusy(button, busy, label) {
    if (!button) {
      return;
    }
    button.disabled = busy;
    const textNode = button.querySelector("span");
    if (textNode) {
      textNode.textContent = label;
    }
  }

  function renderMine() {
    const user = currentUser();
    const involvedOrders = state.orders.filter(
      (order) => order.posterId === state.currentUserId || order.workerId === state.currentUserId
    );
    const postedOrders = involvedOrders.filter((order) => order.posterId === state.currentUserId);
    const acceptedOrders = involvedOrders.filter((order) => order.workerId === state.currentUserId);
    const pendingAmount = acceptedOrders
      .filter((order) => order.status === "submitted")
      .reduce((sum, order) => sum + FriesPay.calculateFee(order.price).workerIncome, 0);
    const earnedAmount = acceptedOrders
      .filter((order) => order.status === "completed")
      .reduce((sum, order) => sum + FriesPay.calculateFee(order.price).workerIncome, 0);
    const certStatus = CERT_STATUS_META[user.certificationStatus || "none"];

    dom.mineBalance.textContent = formatMoney(user.balance);
    dom.minePendingAmount.textContent = formatMoney(pendingAmount);
    dom.mineEarnedAmount.textContent = formatMoney(earnedAmount);
    dom.mineCertStatus.textContent = certStatus.label;
    dom.mineCertStatus.className = "";
    dom.mineCertStatus.classList.add(certStatus.className);

    const visibleOrders =
      state.mineTab === "posted"
        ? postedOrders
        : state.mineTab === "accepted"
          ? acceptedOrders
          : involvedOrders;

    dom.mineOrderList.innerHTML = visibleOrders
      .map((order) => renderOrderCard(order, "mine"))
      .join("");
    dom.mineEmptyState.hidden = visibleOrders.length > 0;
  }

  function renderInfoBookBar() {
    const info = currentUser().infoBook || {};
    const hasInfo = Boolean(info.course || info.location || info.contact || info.campusId);
    dom.infoBookBar.innerHTML = `
      <div class="info-book-summary">
        <span class="info-book-icon">${icon("book")}</span>
        <div class="info-book-copy">
          <strong>我的信息簿</strong>
          <span>${hasInfo ? `${escapeHtml(info.course || "未填课程")} · ${escapeHtml(campusById(info.campusId)?.short || "未选校区")} · ${escapeHtml(info.location || "未填地点")}` : "保存常用信息后，发布订单可一键填写"}</span>
        </div>
      </div>
      <button class="button button-ghost" type="button" data-info-book-action="edit">
        ${icon("edit")}
        <span>编辑信息簿</span>
      </button>
    `;
  }

  function openInfoBookModal() {
    const user = currentUser();
    const info = user.infoBook || {};
    const body = `
      <form id="infoBookForm" class="form-grid">
        <label class="field"><span>学号</span><input id="infoStudentNo" value="${escapeHtml(info.studentNo || "")}" placeholder="例如：2026XXXX"></label>
        <label class="field"><span>常用课程</span><input id="infoCourse" value="${escapeHtml(info.course || "")}" placeholder="例如：高等数学"></label>
        <label class="field"><span>常用代课类型</span><select id="infoType">${["代课", "代签到", "代实验", "代晚自习", "其他"].map((type) => `<option value="${type}" ${info.type === type ? "selected" : ""}>${type}</option>`).join("")}</select></label>
        <label class="field"><span>常用校区</span><select id="infoCampus">${CAMPUSES.map((campus) => `<option value="${campus.id}" ${info.campusId === campus.id ? "selected" : ""}>${escapeHtml(campus.name)}</option>`).join("")}</select></label>
        <label class="field"><span>常用地点</span><input id="infoLocation" value="${escapeHtml(info.location || "")}" placeholder="例如：第三教学楼 302"></label>
        <label class="field"><span>联系方式</span><input id="infoContact" value="${escapeHtml(info.contact || "")}" placeholder="微信 / QQ / 手机号"></label>
        <label class="field"><span>默认备注</span><input id="infoNotes" value="${escapeHtml(info.notes || "")}" placeholder="例如：老师会点名"></label>
      </form>
    `;

    openModal("编辑信息簿", "INFO BOOK", body, [
      { id: "cancel", label: "取消", icon: "x", variant: "button-ghost", onClick: closeModal },
      {
        id: "saveInfoBook",
        label: "保存信息",
        icon: "check",
        variant: "button-primary",
        onClick: () => {
          const form = document.getElementById("infoBookForm");
          if (form && form.reportValidity()) {
            saveInfoBook();
          }
        },
      },
    ]);
  }

  function saveInfoBook() {
    const user = currentUser();
    user.infoBook = {
      studentNo: document.getElementById("infoStudentNo").value.trim(),
      course: document.getElementById("infoCourse").value.trim(),
      type: document.getElementById("infoType").value,
      campusId: document.getElementById("infoCampus").value,
      location: document.getElementById("infoLocation").value.trim(),
      contact: document.getElementById("infoContact").value.trim(),
      notes: document.getElementById("infoNotes").value.trim(),
    };
    saveState();
    closeModal();
    renderInfoBookBar();
    toast("信息簿已保存");
  }

  function applyInfoBookToPublish() {
    const info = currentUser().infoBook || {};
    if (!info.course && !info.location && !info.contact && !info.campusId) {
      toast("请先编辑并保存信息簿");
      openInfoBookModal();
      return;
    }
    if (info.course) {
      document.getElementById("courseName").value = info.course;
    }
    if (info.type) {
      document.getElementById("orderType").value = info.type;
    }
    if (info.campusId) {
      state.publishCampus = info.campusId;
      dom.campus.value = info.campusId;
    }
    if (info.location) {
      document.getElementById("location").value = info.location;
    }
    if (info.contact) {
      document.getElementById("contact").value = info.contact;
    }
    if (info.notes) {
      document.getElementById("notes").value = info.notes;
    }
    renderCampusPicker();
    toast("已从信息簿填入常用信息");
  }

  function renderCertPanel() {
    const user = currentUser();
    const status = user.certificationStatus || "none";
    const cert = latestCertificationForUser(user.id);
    const meta = CERT_STATUS_META[status] || CERT_STATUS_META.none;

    if (status === "approved" && cert) {
      dom.certPanel.innerHTML = `
        <div class="cert-status-card cert-approved">
          <div class="cert-status-icon">${icon("check-circle")}</div>
          <div>
            <span class="status-badge cert-approved">${escapeHtml(meta.label)}</span>
            <h3>接单认证已通过</h3>
            <p>你可以正常接单。管理员仍可根据平台规则取消认证资格。</p>
          </div>
          <button class="button button-ghost" type="button" data-info-book-action="viewCert">查看认证资料</button>
        </div>
      `;
      attachCertForm();
      return;
    }

    if (status === "pending" && cert) {
      dom.certPanel.innerHTML = `
        <div class="cert-status-card cert-pending">
          <div class="cert-status-icon">${icon("clock")}</div>
          <div>
            <span class="status-badge cert-pending">${escapeHtml(meta.label)}</span>
            <h3>认证资料审核中</h3>
            <p>提交时间：${escapeHtml(formatDateTime(cert.submittedAt))}。管理员审核通过后即可接单。</p>
          </div>
        </div>
      `;
      attachCertForm();
      return;
    }

    if (status === "rejected" && cert) {
      dom.certPanel.innerHTML = `
        <div class="cert-status-card cert-rejected">
          <div class="cert-status-icon">${icon("alert")}</div>
          <div>
            <span class="status-badge cert-rejected">${escapeHtml(meta.label)}</span>
            <h3>认证未通过</h3>
            <p>${escapeHtml(cert.reviewNote || "认证资料未通过审核，请重新提交。")}</p>
          </div>
          <button class="button button-primary" type="button" data-cert-resubmit>重新提交</button>
        </div>
      `;
      attachCertForm();
      return;
    }

    if (status === "revoked") {
      dom.certPanel.innerHTML = `
        <div class="cert-status-card cert-revoked">
          <div class="cert-status-icon">${icon("x")}</div>
          <div>
            <span class="status-badge cert-revoked">${escapeHtml(meta.label)}</span>
            <h3>接单认证资格已被取消</h3>
            <p>管理员已取消你的学生认证资格。重新提交并审核通过后才能继续接单。</p>
          </div>
          <button class="button button-primary" type="button" data-cert-resubmit>重新提交</button>
        </div>
      `;
      attachCertForm();
      return;
    }

    dom.certPanel.innerHTML = renderCertForm(user);
    attachCertForm();
  }

  function renderCertForm(user) {
    return `
      <div class="cert-layout">
        <div class="cert-intro">
          <span class="cert-intro-icon">${icon("shield")}</span>
          <h3>为什么需要认证</h3>
          <p>接单涉及进入课堂、签到和课程任务，认证能帮助发布者更放心地选择你。发单不受认证限制。</p>
        </div>
        <form id="certForm" class="cert-form">
          <div class="form-grid">
            <label class="field"><span>姓名</span><input id="certName" value="${escapeHtml(user.name !== "我" ? user.name : "")}" placeholder="请输入真实姓名" required></label>
            <label class="field"><span>学号</span><input id="certStudentNo" placeholder="请输入学号" required></label>
            <label class="field"><span>校区</span><select id="certCampus">${CAMPUSES.map((campus) => `<option value="${campus.id}">${escapeHtml(campus.name)}</option>`).join("")}</select></label>
            <label class="field"><span>学院 / 专业</span><input id="certCollege" placeholder="例如：数学与统计学院" required></label>
            <label class="field"><span>手机号</span><input id="certPhone" placeholder="请输入手机号" required></label>
          </div>
          <div class="field">
            <span>学生证 / 校园卡照片</span>
            <label class="upload-box">
              <input type="file" accept="image/*" data-file-role="cert" required>
              <span class="upload-icon">${icon("image")}</span>
              <strong>点击上传学生证或校园卡</strong>
              <small>图片仅用于人工审核，提交后会进入审核队列</small>
            </label>
            <div class="photo-preview" id="certPreview" hidden></div>
          </div>
          <button class="button button-primary button-large" type="submit">
            ${icon("upload")}
            <span>提交认证审核</span>
          </button>
        </form>
      </div>
    `;
  }

  function attachCertForm() {
    const resubmit = dom.certPanel.querySelector("[data-cert-resubmit]");
    if (resubmit) {
      resubmit.addEventListener("click", () => {
        currentUser().certificationStatus = "none";
        saveState();
        renderCertPanel();
      });
    }
  }

  function openCertDetailModal(cert) {
    if (!cert) {
      return;
    }
    const body = `
      <div class="cert-detail-photo"><img src="${cert.fileDataUrl}" alt="认证资料"></div>
      <dl class="detail-list detail-list-spaced">
        ${detailRow("姓名", cert.name)}
        ${detailRow("学号", cert.studentNo)}
        ${detailRow("校区", campusById(cert.campusId)?.name || "未知校区")}
        ${detailRow("学院 / 专业", cert.college)}
        ${detailRow("手机号", cert.phone)}
        ${detailRow("提交时间", formatDateTime(cert.submittedAt))}
      </dl>
    `;
    openModal("认证资料", "CERTIFICATION", body, [
      { id: "close", label: "关闭", icon: "x", variant: "button-ghost", onClick: closeModal },
    ]);
  }

  function handleCertSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (!form.reportValidity() || !certFileDataUrl) {
      toast("请上传学生证或校园卡照片");
      return;
    }
    const user = currentUser();
    const cert = {
      id: generateId(),
      userId: user.id,
      name: document.getElementById("certName").value.trim() || user.name,
      studentNo: document.getElementById("certStudentNo").value.trim(),
      campusId: document.getElementById("certCampus").value,
      college: document.getElementById("certCollege").value.trim(),
      phone: document.getElementById("certPhone").value.trim(),
      fileDataUrl: certFileDataUrl,
      status: "pending",
      submittedAt: new Date().toISOString(),
    };
    state.certifications.unshift(cert);
    user.certificationStatus = "pending";
    user.certificationId = cert.id;
    certFileDataUrl = null;
    saveState();
    renderCertPanel();
    renderMine();
    toast("认证资料已提交，等待管理员审核");
  }

  function openRechargeModal() {
    const amount = state.selectedRechargeAmount;
    const gift = giftForAmount(amount);
    const body = `
      <div class="recharge-options">
        ${[50, 100, 200, 500]
          .map(
            (value) =>
              `<button class="recharge-option ${amount === value ? "is-active" : ""}" type="button" data-recharge-amount="${value}"><strong>¥${value}</strong><span>赠 ¥${giftForAmount(value)}</span></button>`
          )
          .join("")}
      </div>
      <label class="field recharge-custom">
        <span>自定义金额</span>
        <input id="rechargeAmountInput" type="number" min="1" step="1" value="${amount}" placeholder="输入充值金额">
      </label>
      <div class="recharge-gift-note">
        <span>本次充值赠送</span>
        <strong id="rechargeGiftValue">+¥${gift}</strong>
      </div>
      <div class="gift-tiers">
        <span>充值满 50 送 3</span>
        <span>满 100 送 8</span>
        <span>满 200 送 20</span>
        <span>满 500 送 60</span>
      </div>
    `;

    openModal("余额充值", "RECHARGE", body, [
      { id: "cancel", label: "取消", icon: "x", variant: "button-ghost", onClick: closeModal },
      {
        id: "rechargeNext",
        label: "立即充值",
        icon: "credit-card",
        variant: "button-primary",
        onClick: () => {
          const input = document.getElementById("rechargeAmountInput");
          const value = Number(input?.value || state.selectedRechargeAmount);
          if (!Number.isFinite(value) || value <= 0) {
            toast("请输入有效充值金额");
            return;
          }
          openPaymentModal({
            purpose: "recharge",
            amount: value,
            onSuccess(result) {
              const finalAmount = value + giftForAmount(value);
              creditUserBalance(state.currentUserId, finalAmount);
              saveState();
              renderAll();
              toast(`充值成功，到账 ${formatMoney(finalAmount)}`);
            },
          });
        },
      },
    ]);

    const customInput = document.getElementById("rechargeAmountInput");
    if (customInput) {
      customInput.addEventListener("input", () => {
        const value = Number(customInput.value) || 0;
        state.selectedRechargeAmount = value;
        const giftValue = document.getElementById("rechargeGiftValue");
        if (giftValue) {
          giftValue.textContent = `+¥${giftForAmount(value)}`;
        }
      });
    }
  }

  function selectRechargeAmount(amount) {
    state.selectedRechargeAmount = amount;
    document.querySelectorAll("[data-recharge-amount]").forEach((button) => {
      button.classList.toggle("is-active", Number(button.dataset.rechargeAmount) === amount);
    });
    const input = document.getElementById("rechargeAmountInput");
    if (input) {
      input.value = amount;
    }
    const giftValue = document.getElementById("rechargeGiftValue");
    if (giftValue) {
      giftValue.textContent = `+¥${giftForAmount(amount)}`;
    }
  }

  function openWithdrawModal() {
    const body = `
      <div class="withdraw-box">
        <div class="withdraw-balance">
          <span>可提现余额</span>
          <strong>${formatMoney(currentUser().balance)}</strong>
        </div>
        <p class="payment-note">提现请联系管理员微信：<strong>Hurrkan</strong>。管理员核对订单和账户信息后人工处理提现。</p>
        <button class="button button-ghost button-block" type="button" data-copy-text="Hurrkan">
          ${icon("copy")}
          <span>复制管理员微信号</span>
        </button>
      </div>
    `;
    openModal("申请提现", "WITHDRAW", body, [
      { id: "close", label: "知道了", icon: "check", variant: "button-primary", onClick: closeModal },
    ]);
  }

  function openAdminLogin() {
    const body = `
      <form id="adminLoginForm">
        <label class="field">
          <span>管理员密码</span>
          <input id="adminPassword" type="password" autocomplete="current-password" placeholder="请输入管理员密码">
        </label>
      </form>
    `;
    openModal("管理员登录", "ADMIN LOGIN", body, [
      { id: "cancel", label: "取消", icon: "x", variant: "button-ghost", onClick: closeModal },
      {
        id: "adminLogin",
        label: "进入后台",
        icon: "key",
        variant: "button-primary",
        onClick: () => {
          const form = document.getElementById("adminLoginForm");
          const password = document.getElementById("adminPassword")?.value || "";
          if (password === ADMIN_PASSWORD) {
            state.adminAuthed = true;
            closeModal();
            switchView("admin");
            toast("管理员登录成功");
          } else {
            toast("密码错误，请重新输入");
          }
        },
      },
    ]);
  }

  function renderAdmin() {
    document.querySelectorAll("[data-admin-tab]").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.adminTab === state.adminTab);
    });

    if (state.adminTab === "users") {
      renderAdminUsers();
    }
    if (state.adminTab === "orders") {
      renderAdminOrders();
    }
    if (state.adminTab === "certs") {
      renderAdminCerts();
    }
  }

  function renderAdminUsers() {
    const term = state.adminSearch.trim().toLowerCase();
    const users = state.users
      .filter((user) => user.role !== "admin")
      .filter((user) => {
        if (!term) {
          return true;
        }
        return [user.name, user.id, user.phone || "", campusById(user.campusId)?.name || ""]
          .join(" ")
          .toLowerCase()
          .includes(term);
      });

    dom.adminContent.innerHTML = `
      <div class="admin-list-header">
        <span>用户</span>
        <span>校区</span>
        <span>余额</span>
        <span>认证状态</span>
        <span>操作</span>
      </div>
      <div class="admin-list admin-orders-list">
        ${users
          .map((user) => {
            const certStatus = CERT_STATUS_META[user.certificationStatus || "none"];
            return `
              <div class="admin-row">
                <div class="admin-user-cell">
                  ${avatar(user.id, user.name)}
                  <div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.phone || "未填写手机号")}</small></div>
                </div>
                <span>${escapeHtml(campusById(user.campusId)?.short || "未知校区")}</span>
                <strong>${formatMoney(user.balance)}</strong>
                <span class="status-badge ${certStatus.className}">${escapeHtml(certStatus.label)}</span>
                <div class="admin-row-actions">
                  <button class="button button-ghost" type="button" data-admin-action="balance" data-id="${user.id}">调整余额</button>
                  <button class="button button-danger" type="button" data-admin-action="revoke" data-id="${user.id}" ${user.certificationStatus === "approved" ? "" : "disabled"}>取消认证</button>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderAdminOrders() {
    const term = state.adminSearch.trim().toLowerCase();
    const orders = state.orders
      .filter((order) => {
        if (!term) {
          return true;
        }
        return [
          order.id,
          order.course,
          order.location,
          order.posterName,
          order.workerName || "",
          STATUS_META[order.status]?.label || "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    dom.adminContent.innerHTML = `
      <div class="admin-list-header admin-orders-header">
        <span>订单</span>
        <span>发布 / 接单</span>
        <span>金额</span>
        <span>状态</span>
        <span>操作</span>
      </div>
      <div class="admin-list">
        ${orders
          .map((order) => {
            const status = STATUS_META[order.status] || STATUS_META.open;
            return `
              <div class="admin-row">
                <div class="admin-user-cell">
                  <strong>${escapeHtml(order.course)}</strong>
                  <small>${escapeHtml(order.id)}</small>
                </div>
                <span>${escapeHtml(order.posterName)} / ${escapeHtml(order.workerName || "未接单")}</span>
                <strong>${formatMoney(order.price)}</strong>
                <span class="status-badge ${status.className}">${escapeHtml(status.label)}</span>
                <div class="admin-row-actions">
                  <button class="button button-ghost" type="button" data-admin-action="order-detail" data-id="${order.id}">查看</button>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderAdminCerts() {
    const term = state.adminSearch.trim().toLowerCase();
    const certs = state.certifications
      .filter((cert) => {
        if (!term) {
          return true;
        }
        return [cert.name, cert.studentNo, cert.college, cert.status]
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));

    dom.adminContent.innerHTML = `
      <div class="admin-list-header">
        <span>申请人</span>
        <span>校区</span>
        <span>状态</span>
        <span>提交时间</span>
        <span>操作</span>
      </div>
      <div class="admin-list">
        ${certs
          .map((cert) => {
            const status = CERT_STATUS_META[cert.status] || CERT_STATUS_META.pending;
            return `
              <div class="admin-row">
                <div class="admin-user-cell">
                  <div class="cert-thumb"><img src="${cert.fileDataUrl}" alt="认证资料"></div>
                  <div><strong>${escapeHtml(cert.name)}</strong><small>${escapeHtml(cert.studentNo)}</small></div>
                </div>
                <span>${escapeHtml(campusById(cert.campusId)?.short || "未知校区")}</span>
                <span class="status-badge ${status.className}">${escapeHtml(status.label)}</span>
                <span>${escapeHtml(formatDateTime(cert.submittedAt))}</span>
                <div class="admin-row-actions">
                  ${cert.status === "pending" ? `<button class="button button-primary" type="button" data-admin-action="approve-cert" data-id="${cert.id}">通过</button><button class="button button-ghost" type="button" data-admin-action="reject-cert" data-id="${cert.id}">驳回</button>` : `<button class="button button-ghost" type="button" data-admin-action="view-cert" data-id="${cert.id}">查看</button>`}
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function handleAdminAction(action, id) {
    if (action === "balance") {
      openAdminBalanceModal(id);
    }
    if (action === "revoke") {
      revokeCertification(id);
    }
    if (action === "order-detail") {
      openDetailModal(id);
    }
    if (action === "approve-cert") {
      approveCertification(id);
    }
    if (action === "reject-cert") {
      rejectCertification(id);
    }
    if (action === "view-cert") {
      openCertDetailModal(state.certifications.find((cert) => cert.id === id));
    }
  }

  function openAdminBalanceModal(userId) {
    const user = state.users.find((item) => item.id === userId);
    if (!user) {
      return;
    }
    const body = `
      <form id="adminBalanceForm">
        <div class="fee-breakdown">
          <div class="fee-line"><span>用户</span><strong>${escapeHtml(user.name)}</strong></div>
          <div class="fee-line"><span>当前余额</span><strong>${formatMoney(user.balance)}</strong></div>
        </div>
        <label class="field">
          <span>调整金额（正数增加，负数扣减）</span>
          <input id="adminBalanceAmount" type="number" step="0.01" placeholder="例如：50 或 -20" required>
        </label>
      </form>
    `;
    openModal("调整用户余额", "ADMIN BALANCE", body, [
      { id: "cancel", label: "取消", icon: "x", variant: "button-ghost", onClick: closeModal },
      {
        id: "saveAdminBalance",
        label: "保存调整",
        icon: "check",
        variant: "button-primary",
        onClick: () => {
          const form = document.getElementById("adminBalanceForm");
          const rawAmount = document.getElementById("adminBalanceAmount")?.value.trim() || "";
          const amount = Number(rawAmount);
          if (!form || !rawAmount || !Number.isFinite(amount)) {
            toast("请输入有效调整金额");
            return;
          }
          user.balance = FriesPay.roundMoney(user.balance + amount);
          saveState();
          closeModal();
          renderAdmin();
          renderTopBalance();
          toast(`已调整 ${escapeHtml(user.name)} 的余额`);
        },
      },
    ]);
  }

  function approveCertification(certId) {
    const cert = state.certifications.find((item) => item.id === certId);
    if (!cert) {
      return;
    }
    cert.status = "approved";
    cert.reviewedAt = new Date().toISOString();
    cert.reviewNote = "";
    const user = state.users.find((item) => item.id === cert.userId);
    if (user) {
      user.certificationStatus = "approved";
      user.certificationId = cert.id;
    }
    saveState();
    renderAdmin();
    if (cert.userId === state.currentUserId) {
      renderCertPanel();
    }
    toast(`已通过 ${escapeHtml(cert.name)} 的接单认证`);
  }

  function rejectCertification(certId) {
    const cert = state.certifications.find((item) => item.id === certId);
    if (!cert) {
      return;
    }
    cert.status = "rejected";
    cert.reviewedAt = new Date().toISOString();
    cert.reviewNote = "认证资料未通过审核，请重新提交。";
    const user = state.users.find((item) => item.id === cert.userId);
    if (user) {
      user.certificationStatus = "rejected";
      user.certificationId = cert.id;
    }
    saveState();
    renderAdmin();
    if (cert.userId === state.currentUserId) {
      renderCertPanel();
    }
    toast(`已驳回 ${escapeHtml(cert.name)} 的接单认证`);
  }

  function revokeCertification(userId) {
    const user = state.users.find((item) => item.id === userId);
    if (!user || user.certificationStatus !== "approved") {
      toast("该用户当前没有可取消的有效认证");
      return;
    }
    user.certificationStatus = "revoked";
    const cert = state.certifications.find((item) => item.id === user.certificationId);
    if (cert) {
      cert.status = "revoked";
      cert.reviewedAt = new Date().toISOString();
    }
    saveState();
    renderAdmin();
    if (userId === state.currentUserId) {
      renderCertPanel();
      renderMine();
    }
    toast(`已取消 ${escapeHtml(user.name)} 的接单认证资格`);
  }

  function renderAll() {
    renderOverviewStats();
    renderFeed();
    renderMine();
    renderInfoBookBar();
    renderTopBalance();
    if (state.adminAuthed) {
      renderAdmin();
    }
  }

  function handleFormSubmit(event) {
    if (event.target.id === "publishForm") {
      handlePublishSubmit(event);
    }
    if (event.target.id === "certForm") {
      handleCertSubmit(event);
    }
    if (event.target.id === "infoBookForm") {
      event.preventDefault();
      if (event.target.reportValidity()) {
        saveInfoBook();
      }
    }
    if (event.target.id === "evidenceForm") {
      event.preventDefault();
      if (event.target.reportValidity()) {
        handleEvidenceSubmit();
      }
    }
    if (event.target.id === "adminLoginForm") {
      event.preventDefault();
    }
    if (event.target.id === "adminBalanceForm") {
      event.preventDefault();
    }
  }

  function handleFileChange(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) {
      return;
    }
    const role = input.dataset.fileRole;
    compressImage(file, 900, 0.72)
      .then((dataUrl) => {
        if (role === "cert") {
          certFileDataUrl = dataUrl;
          showPhotoPreview("certPreview", dataUrl);
        }
        if (role === "evidence") {
          evidenceFileDataUrl = dataUrl;
          showPhotoPreview("evidencePreview", dataUrl);
        }
      })
      .catch(() => {
        toast("图片读取失败，请重新选择");
      });
  }

  function showPhotoPreview(id, dataUrl) {
    const container = document.getElementById(id);
    if (!container) {
      return;
    }
    container.hidden = false;
    container.innerHTML = `<img src="${dataUrl}" alt="上传预览">`;
  }

  function openModal(title, kicker, bodyHtml, actions) {
    state.modalActions = actions || [];
    dom.modalKicker.textContent = kicker;
    dom.modalTitle.textContent = title;
    dom.modalBody.innerHTML = bodyHtml;
    dom.modalFooter.innerHTML = state.modalActions.map((action) => modalButtonHtml(action)).join("");
    dom.modalBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    dom.modalBackdrop.hidden = true;
    dom.modalBody.innerHTML = "";
    dom.modalFooter.innerHTML = "";
    state.modalActions = [];
    state.activeOrderId = null;
    state.payment = null;
    document.body.style.overflow = "";
  }

  function modalButtonHtml(action) {
    const variant = action.variant || "button-ghost";
    return `<button class="button ${variant}" type="button" data-modal-action="${action.id}">${action.icon ? icon(action.icon) : ""}<span>${escapeHtml(action.label)}</span></button>`;
  }

  function updateFeePreview() {
    const price = Number(dom.price.value) || 0;
    const fee = FriesPay.calculateFee(price);
    dom.previewOrderAmount.textContent = formatMoney(fee.amount);
    dom.previewServiceFee.textContent = `-${formatMoney(fee.serviceFee)}`;
    dom.previewTotal.textContent = formatMoney(fee.amount);
    dom.previewWorkerIncome.textContent = formatMoney(fee.workerIncome);
  }

  function currentUser() {
    return state.users.find((user) => user.id === state.currentUserId) || state.users[0];
  }

  function latestCertificationForUser(userId) {
    return state.certifications
      .filter((cert) => cert.userId === userId)
      .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))[0];
  }

  function creditUserBalance(userId, amount) {
    const user = state.users.find((item) => item.id === userId);
    if (!user) {
      return;
    }
    user.balance = FriesPay.roundMoney(Number(user.balance || 0) + Number(amount || 0));
  }

  function giftForAmount(amount) {
    const matched = RECHARGE_GIFTS.filter((tier) => amount >= tier.min).sort((a, b) => b.min - a.min)[0];
    return matched ? matched.gift : 0;
  }

  function campusById(id) {
    return CAMPUSES.find((campus) => campus.id === id);
  }

  function formatDateCN(isoDate) {
    if (!isoDate) {
      return "日期待定";
    }
    const parts = String(isoDate).split("-");
    if (parts.length < 3) {
      return isoDate;
    }
    return `${Number(parts[1])}月${Number(parts[2])}日`;
  }

  function formatDateTime(isoString) {
    if (!isoString) {
      return "时间未知";
    }
    const date = new Date(isoString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function formatMoney(value) {
    return `¥${Number(value || 0).toFixed(2)}`;
  }

  function localISODate(offset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function generateId() {
    return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function icon(name) {
    return `<svg><use href="#icon-${name}"></use></svg>`;
  }

  function avatar(id, name) {
    const initial = escapeHtml(String(name || "?").slice(0, 1));
    return `<span class="avatar" style="background:${userColor(id)}">${initial}</span>`;
  }

  function userColor(id) {
    let hash = 0;
    String(id).split("").forEach((char) => {
      hash = (hash * 31 + char.charCodeAt(0)) % 997;
    });
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      };
      return map[char];
    });
  }

  function copyText(text) {
    const fallback = () => toast(`请手动复制：${text}`);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(text)
        .then(() => toast(`已复制：${text}`))
        .catch(fallback);
    } else {
      fallback();
    }
  }

  function toast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add("is-visible");
    window.clearTimeout(toast._timeout);
    toast._timeout = window.setTimeout(() => {
      dom.toast.classList.remove("is-visible");
    }, 2800);
  }

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          users: state.users,
          certifications: state.certifications,
          orders: state.orders,
        })
      );
    } catch (error) {
      console.warn("数据无法写入本地存储", error);
    }
    if (serverStateReady) {
      syncToServer();
    }
  }

  function apiFetch(path, options) {
    const opts = options || {};
    const headers = Object.assign({
      "Content-Type": "application/json",
    }, opts.headers || {});
    if (sessionToken) {
      headers.Authorization = "Bearer " + sessionToken;
    }
    return fetch(SERVER_BASE + path, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (response) {
      return response.json().catch(function () {
        return { ok: false, message: "服务返回异常" };
      }).then(function (data) {
        if (!response.ok || data.ok === false) {
          throw new Error(data.message || "请求失败");
        }
        return data;
      });
    });
  }

  function applyServerState(data) {
    if (!data || !data.state) {
      return;
    }
    state.currentUserId = data.currentUserId || state.currentUserId;
    state.users = Array.isArray(data.state.users) ? data.state.users : state.users;
    state.certifications = Array.isArray(data.state.certifications) ? data.state.certifications : state.certifications;
    state.orders = Array.isArray(data.state.orders) ? data.state.orders : state.orders;
    serverStateReady = true;
  }

  function syncToServer() {
    if (!sessionToken || !serverStateReady) {
      return Promise.resolve();
    }
    const snapshot = {
      users: state.users,
      certifications: state.certifications,
      orders: state.orders,
    };
    syncChain = syncChain.then(function () {
      return apiFetch("/api/sync", {
        method: "POST",
        body: snapshot,
      }).then(function (data) {
        applyServerState(data);
      });
    }).catch(function (error) {
      console.warn("云端同步失败", error);
    });
    return syncChain;
  }

  function bootstrapFromServer(isRefresh) {
    const tokenBefore = sessionToken;
    const pendingSync = isRefresh ? syncToServer() : Promise.resolve();
    return pendingSync.then(function () {
      return apiFetch("/api/session", {
        method: "POST",
        body: tokenBefore ? { token: tokenBefore } : {},
      });
    }).then(function (data) {
      sessionToken = data.token;
      localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
      applyServerState(data);
      renderAll();
      if (!isRefresh) {
        switchView("home");
      }
    }).catch(function (error) {
      console.warn("云端会话初始化失败，将使用本地演示数据", error);
      serverStateReady = false;
    });
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          users: Array.isArray(parsed.users) ? parsed.users : [],
          certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
          orders: Array.isArray(parsed.orders) ? parsed.orders : [],
        };
      }
    } catch (error) {
      console.warn("本地数据读取失败，将使用演示数据", error);
    }
    return seedState();
  }

  function seedState() {
    const today = localISODate(0);
    const tomorrow = localISODate(1);
    const yesterday = localISODate(-1);
    const createdAt = new Date().toISOString();

    const users = [
      {
        id: "me",
        name: "我",
        phone: "138****0000",
        campusId: "shaziao",
        role: "student",
        balance: 80,
        certificationStatus: "none",
        certificationId: null,
        infoBook: {
          studentNo: "2026091601",
          course: "高等数学",
          type: "代课",
          campusId: "shaziao",
          location: "第三教学楼 302",
          contact: "微信：chen_2026",
          notes: "老师会点名，下课后发签到码。",
        },
      },
      { id: "admin", name: "管理员", phone: "平台后台", campusId: "shaziao", role: "admin", balance: 0, certificationStatus: "none" },
      { id: "u2", name: "李同学", phone: "137****1122", campusId: "datianwan", role: "student", balance: 32, certificationStatus: "approved", certificationId: "cert-u2" },
      { id: "u3", name: "赵同学", phone: "136****2233", campusId: "leigongjing", role: "student", balance: 54, certificationStatus: "approved", certificationId: "cert-u3" },
      { id: "u4", name: "王同学", phone: "135****3344", campusId: "zhangjiajie", role: "student", balance: 18, certificationStatus: "approved", certificationId: "cert-u4" },
      { id: "u5", name: "周同学", phone: "134****4455", campusId: "shaziao", role: "student", balance: 0, certificationStatus: "none" },
      { id: "u6", name: "林同学", phone: "133****5566", campusId: "datianwan", role: "student", balance: 26, certificationStatus: "pending", certificationId: "cert-u6" },
      { id: "u7", name: "何同学", phone: "132****6677", campusId: "leigongjing", role: "student", balance: 0, certificationStatus: "none" },
      { id: "u8", name: "郑同学", phone: "131****7788", campusId: "zhangjiajie", role: "student", balance: 12, certificationStatus: "approved", certificationId: "cert-u8" },
      { id: "u9", name: "孙同学", phone: "130****8899", campusId: "shaziao", role: "student", balance: 40, certificationStatus: "approved", certificationId: "cert-u9" },
    ];

    const certifications = [
      {
        id: "cert-u2",
        userId: "u2",
        name: "李同学",
        studentNo: "2025260112",
        campusId: "datianwan",
        college: "文学与新闻传播学院",
        phone: "137****1122",
        fileDataUrl: "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380"><rect width="600" height="380" fill="#eef3f0"/><rect x="90" y="72" width="420" height="236" rx="18" fill="#ffffff" stroke="#16865f" stroke-width="6"/><circle cx="190" cy="190" r="54" fill="#cfe3da"/><path d="M130 274h120v-32a60 60 0 0 1 120 0v32" fill="#16865f"/><text x="300" y="175" font-size="28" font-family="sans-serif" fill="#1b2a32">学生证</text><text x="300" y="225" font-size="20" font-family="sans-serif" fill="#718087">李同学 · 2025260112</text></svg>'),
        status: "approved",
        submittedAt: new Date(Date.now() - 86400000).toISOString(),
        reviewedAt: new Date(Date.now() - 80000000).toISOString(),
      },
      {
        id: "cert-u6",
        userId: "u6",
        name: "林同学",
        studentNo: "2025260116",
        campusId: "datianwan",
        college: "物理与机电工程学院",
        phone: "133****5566",
        fileDataUrl: "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380"><rect width="600" height="380" fill="#fff4cf"/><rect x="90" y="72" width="420" height="236" rx="18" fill="#ffffff" stroke="#2c6fbb" stroke-width="6"/><circle cx="190" cy="190" r="54" fill="#dceeff"/><path d="M130 274h120v-32a60 60 0 0 1 120 0v32" fill="#2c6fbb"/><text x="300" y="175" font-size="28" font-family="sans-serif" fill="#1b2a32">校园卡</text><text x="300" y="225" font-size="20" font-family="sans-serif" fill="#718087">林同学 · 2025260116</text></svg>'),
        status: "pending",
        submittedAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: "cert-u8",
        userId: "u8",
        name: "郑同学",
        studentNo: "2025260118",
        campusId: "zhangjiajie",
        college: "商学院",
        phone: "131****7788",
        fileDataUrl: "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380"><rect width="600" height="380" fill="#e2f6ee"/><rect x="90" y="72" width="420" height="236" rx="18" fill="#ffffff" stroke="#16865f" stroke-width="6"/><circle cx="190" cy="190" r="54" fill="#cfe3da"/><path d="M130 274h120v-32a60 60 0 0 1 120 0v32" fill="#16865f"/><text x="300" y="175" font-size="28" font-family="sans-serif" fill="#1b2a32">学生证</text><text x="300" y="225" font-size="20" font-family="sans-serif" fill="#718087">郑同学 · 2025260118</text></svg>'),
        status: "approved",
        submittedAt: new Date(Date.now() - 172800000).toISOString(),
        reviewedAt: new Date(Date.now() - 160000000).toISOString(),
      },
    ];

    const makePayment = (providerId = "sandbox") => ({
      providerId,
      transactionId: `PAID_${providerId.toUpperCase()}_${Date.now().toString(36)}`,
      paidAt: createdAt,
    });

    const orders = [
      {
        id: "demo-1",
        type: "代课",
        course: "高等数学",
        campusId: "shaziao",
        location: "第三教学楼 302",
        date: today,
        time: "08:00",
        price: 35,
        notes: "老师会点名，下课后需要发签到码。",
        contact: "微信：chen_2026",
        posterId: "me",
        posterName: "我",
        workerId: null,
        workerName: null,
        status: "open",
        createdDate: today,
        createdAt,
        paid: true,
        payment: makePayment("sandbox"),
      },
      {
        id: "demo-2",
        type: "代签到",
        course: "大学英语",
        campusId: "datianwan",
        location: "文科楼 210",
        date: today,
        time: "10:20",
        price: 28,
        notes: "只需要帮忙签到，不用整节课都在。",
        contact: "QQ：3471820",
        posterId: "u2",
        posterName: "李同学",
        workerId: null,
        workerName: null,
        status: "open",
        createdDate: today,
        createdAt,
        paid: true,
        payment: makePayment("wechat"),
      },
      {
        id: "demo-3",
        type: "代课",
        course: "计算机基础",
        campusId: "leigongjing",
        location: "实训楼 505",
        date: today,
        time: "14:00",
        price: 42,
        notes: "需要帮忙做随堂练习，题目不多。",
        contact: "微信：liu_ke_ji",
        posterId: "u3",
        posterName: "赵同学",
        workerId: "u4",
        workerName: "王同学",
        status: "progress",
        createdDate: today,
        createdAt,
        paid: true,
        payment: makePayment("alipay"),
      },
      {
        id: "demo-4",
        type: "代晚自习",
        course: "线性代数",
        campusId: "zhangjiajie",
        location: "逸夫楼 102",
        date: yesterday,
        time: "19:00",
        price: 30,
        notes: "晚自习签到后即可，不点名。",
        contact: "微信：math_2026",
        posterId: "u4",
        posterName: "王同学",
        workerId: "u8",
        workerName: "郑同学",
        status: "submitted",
        createdDate: yesterday,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        paid: true,
        payment: makePayment("sandbox"),
        evidence: {
          fileDataUrl: "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380"><rect width="600" height="380" fill="#e2f6ee"/><rect x="70" y="54" width="460" height="272" rx="20" fill="#ffffff" stroke="#16865f" stroke-width="6"/><text x="300" y="160" font-size="34" font-family="sans-serif" fill="#1b2a32">签到成功</text><text x="300" y="215" font-size="24" font-family="sans-serif" fill="#16865f">线性代数 · 逸夫楼 102</text></svg>'),
          note: "已完成签到，附上签到成功截图。",
          submittedAt: new Date(Date.now() - 7200000).toISOString(),
        },
      },
      {
        id: "demo-5",
        type: "代课",
        course: "形势与政策",
        campusId: "shaziao",
        location: "学术报告厅",
        date: tomorrow,
        time: "09:00",
        price: 25,
        notes: "带学生证签到，下课后拍照片。",
        contact: "手机：188****3621",
        posterId: "u5",
        posterName: "周同学",
        workerId: null,
        workerName: null,
        status: "open",
        createdDate: tomorrow,
        createdAt: new Date(Date.now() + 3600000).toISOString(),
        paid: true,
        payment: makePayment("wechat"),
      },
      {
        id: "demo-6",
        type: "代实验",
        course: "大学物理实验",
        campusId: "datianwan",
        location: "实验楼 B302",
        date: tomorrow,
        time: "14:30",
        price: 45,
        notes: "需要代写实验数据，提供模板。",
        contact: "微信：phy_lab",
        posterId: "u6",
        posterName: "林同学",
        workerId: null,
        workerName: null,
        status: "open",
        createdDate: tomorrow,
        createdAt: new Date(Date.now() + 7200000).toISOString(),
        paid: true,
        payment: makePayment("alipay"),
      },
      {
        id: "demo-7",
        type: "代签到",
        course: "体育课",
        campusId: "leigongjing",
        location: "田径场",
        date: tomorrow,
        time: "16:00",
        price: 20,
        notes: "集合时签个到，跑圈不用代。",
        contact: "QQ：908112",
        posterId: "u7",
        posterName: "何同学",
        workerId: null,
        workerName: null,
        status: "open",
        createdDate: tomorrow,
        createdAt: new Date(Date.now() + 10800000).toISOString(),
        paid: true,
        payment: makePayment("sandbox"),
      },
      {
        id: "demo-8",
        type: "代课",
        course: "概率论",
        campusId: "zhangjiajie",
        location: "第二教学楼 210",
        date: yesterday,
        time: "10:10",
        price: 32,
        notes: "老师可能随机提问，最好会一点概率论。",
        contact: "微信：prob_2026",
        posterId: "u8",
        posterName: "郑同学",
        workerId: "u9",
        workerName: "孙同学",
        status: "completed",
        createdDate: yesterday,
        createdAt: new Date(Date.now() - 43200000).toISOString(),
        paid: true,
        payment: makePayment("sandbox"),
      },
    ];

    return { users, certifications, orders };
  }

  function compressImage(file, maxSize, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          let { width, height } = image;
          const scale = Math.min(1, maxSize / Math.max(width, height));
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        image.onerror = reject;
        image.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
})();
