/* =========================================================
   WOGE ORDER MANAGER
   CLOUD + REALTIME VERSION
   ========================================================= */


/* =========================================================
   SUPABASE CONFIGURATION
   ========================================================= */

const SUPABASE_URL =
  "https://xdvhqanrjuryehkwfnzm.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_6b67HA38wdGaP1BJuIyY6w_8R1ePgsc";


const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );


/* =========================================================
   CONSTANTS
   ========================================================= */

const ORDER_STATUSES = [
  "Created",
  "In Progress",
  "Pending",
  "Packed",
  "Shipped",
  "In transit",
  "Delivered",
  "RTO"
];


const PAYMENT_STATUSES = [
  "Paid",
  "Partially Paid",
  "Unpaid",
  "Pay on Delivery"
];


const PAYMENT_METHODS = [
  "Cash",
  "UPI",
  "Bank Transfer",
  "Card",
  "Other"
];


const DELIVERY_TYPES = [
  "Pickup",
  "Local Delivery",
  "Courier",
  "Transport"
];


const DEFAULT_PRODUCT_PRICES = {
  "Huge Premium LED Podium": 65000,
  "Premium LED Podium": 58500,
  "Double SS Piped Podium": 22500,
  "Single SS Piped Podium": 20000,
  "Small Curved Podium": 15999,
  "Acrylic Curved Steel Piped Podium": 35000,
  "Vast Acrylic Piped Premium Podium": 40000,
  "Premium X Medium Podium": 40000,
  "Gold Steel Podium – White Top & Base": 25000,
  "Black Steel Podium": 24000,
  "Steel Podium – White Top & Base": 23000,
  "Basic LED Podium": 26500,
  "Basic Podium": 22500
};

const CUSTOM_PRODUCT_PRICES_KEY = "WOGE_CUSTOM_PRODUCT_PRICES_V1";

function getCustomProductPrices() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_PRODUCT_PRICES_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function getProductPrice(name) {
  const custom = getCustomProductPrices();
  if (Object.prototype.hasOwnProperty.call(custom, name)) {
    return Number(custom[name]) || 0;
  }
  return Number(DEFAULT_PRODUCT_PRICES[name]) || 0;
}

function setCustomProductPrice(name, price) {
  const custom = getCustomProductPrices();
  custom[name] = Number(price) || 0;
  localStorage.setItem(CUSTOM_PRODUCT_PRICES_KEY, JSON.stringify(custom));
}



/* =========================================================
   LOCAL APPLICATION DATA
   ========================================================= */

let orders = [];

let products = [];

let realtimeChannel = null;

let currentUser = null;


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}


function money(value) {

  return "₹" +
    Number(value || 0).toLocaleString(
      "en-IN",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    );

}


function today() {

  const d = new Date();

  return d.toISOString().slice(0, 10);

}


function currentMonth() {

  return today().slice(0, 7);

}


function escapeHTML(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


function generateOrderNumber() {

  const year =
    new Date().getFullYear();

  let highest = 0;

  orders.forEach(order => {

    const match =
      String(order.orderNo || "")
        .match(/(\d+)$/);

    if (match) {

      const number =
        parseInt(match[1], 10);

      if (number > highest) {

        highest = number;

      }

    }

  });

  return (
    "WOGE-" +
    year +
    "-" +
    String(highest + 1)
      .padStart(4, "0")
  );

}


/* =========================================================
   PAYMENT AUTOMATION
   ========================================================= */

function calculatePaymentStatus(
  total,
  advance,
  selectedStatus
) {

  total =
    Number(total) || 0;

  advance =
    Number(advance) || 0;


  if (
    selectedStatus ===
    "Pay on Delivery"
  ) {

    return "Pay on Delivery";

  }


  if (advance <= 0) {

    return "Unpaid";

  }


  if (
    total > 0 &&
    advance >= total
  ) {

    return "Paid";

  }


  return "Partially Paid";

}


function calculateBalance(
  total,
  advance
) {

  return Math.max(
    0,
    (Number(total) || 0) -
    (Number(advance) || 0)
  );

}


/* =========================================================
   DATABASE → APPLICATION FORMAT
   ========================================================= */

function databaseOrderToApp(row) {

  return {

    id:
      row.id,

    orderNo:
      row.order_no,

    date:
      row.order_date,

    customer:
      row.customer_name,

    mobile:
      row.mobile || "",

    product:
      row.product_name,

    productId:
      row.product_id,

    qty:
      Number(row.quantity || 0),

    rate:
      Number(row.rate || 0),

    total:
      Number(row.total_amount || 0),

    finalPrice:
      Number(row.quantity || 0) > 0
        ? Number(row.total_amount || 0) / Number(row.quantity || 1)
        : Number(row.total_amount || 0),

    advance:
      Number(row.advance_paid || 0),

    balance:
      Number(row.balance_due || 0),

    paymentStatus:
      row.payment_status,

    orderStatus:
      row.order_status,

    deliveryDate:
      row.delivery_date || "",

    paymentMethod:
      row.payment_method || "",

    deliveryType:
      row.delivery_type || "",

    notes:
      row.notes || "",

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at

  };

}


/* =========================================================
   DATABASE → PRODUCT FORMAT
   ========================================================= */

function databaseProductToApp(row) {

  return {

    id:
      row.id,

    name:
      row.name,

    active:
      row.active,

    price:
      getProductPrice(row.name),

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at

  };

}


/* =========================================================
   AUTHENTICATION UI
   ========================================================= */

function createLoginScreen() {

  if ($("wogeLoginScreen")) {

    return;

  }


  const overlay =
    document.createElement("div");


  overlay.id =
    "wogeLoginScreen";


  overlay.innerHTML = `

    <div class="woge-login-box">

      <div class="woge-login-logo">

        <div class="woge-login-w">
          W
        </div>

      </div>


      <div class="woge-login-brand">
        WORD OF GOD ENTERPRISES
      </div>


      <h1>
        WOGE Orders
      </h1>


      <p class="woge-login-subtitle">
        Secure Order Management
      </p>


      <form id="wogeLoginForm">

        <label>
          Email
        </label>

        <input
          type="email"
          id="wogeLoginEmail"
          placeholder="Email address"
          autocomplete="username"
          required
        >


        <label>
          Password
        </label>

        <input
          type="password"
          id="wogeLoginPassword"
          placeholder="Password"
          autocomplete="current-password"
          required
        >


        <button
          type="submit"
          class="woge-login-button"
        >
          Sign In
        </button>


        <div
          id="wogeLoginMessage"
          class="woge-login-message"
        ></div>

      </form>


      <div class="woge-login-footer">
        WOGE ORDER MANAGER
      </div>

    </div>

  `;


  document.body.appendChild(
    overlay
  );


  document
    .getElementById("wogeLoginForm")
    .addEventListener(
      "submit",
      loginUser
    );

}


function addLoginStyles() {

  if (
    document.getElementById(
      "wogeLoginStyles"
    )
  ) {

    return;

  }


  const style =
    document.createElement("style");


  style.id =
    "wogeLoginStyles";


  style.textContent = `

    #wogeLoginScreen {

      position: fixed;

      inset: 0;

      z-index: 999999;

      display: flex;

      align-items: center;

      justify-content: center;

      background:
        radial-gradient(
          circle at top right,
          rgba(212,175,55,.10),
          transparent 35%
        ),
        #080808;

      padding: 20px;

    }


    .woge-login-box {

      width: 100%;

      max-width: 430px;

      padding: 42px;

      background:
        linear-gradient(
          145deg,
          #151515,
          #0b0b0b
        );

      border: 1px solid
        rgba(212,175,55,.35);

      border-radius: 18px;

      box-shadow:
        0 25px 80px
        rgba(0,0,0,.65);

    }


    .woge-login-logo {

      display: flex;

      justify-content: center;

      margin-bottom: 20px;

    }


    .woge-login-w {

      width: 62px;

      height: 62px;

      display: flex;

      align-items: center;

      justify-content: center;

      border: 1px solid
        #c9a227;

      border-radius: 14px;

      color: #d4af37;

      font-family: Georgia, serif;

      font-size: 34px;

    }


    .woge-login-brand {

      text-align: center;

      color: #d4af37;

      font-size: 11px;

      font-weight: 700;

      letter-spacing: 2px;

      margin-bottom: 10px;

    }


    .woge-login-box h1 {

      text-align: center;

      margin: 0;

      color: #f4f0e5;

      font-family: Georgia, serif;

      font-size: 34px;

    }


    .woge-login-subtitle {

      text-align: center;

      color: #999;

      margin: 8px 0 30px;

      font-size: 13px;

    }


    .woge-login-box label {

      display: block;

      color: #b9b9b9;

      font-size: 12px;

      margin:
        15px 0 7px;

    }


    .woge-login-box input {

      width: 100%;

      box-sizing: border-box;

      padding: 13px 14px;

      background: #101010;

      border: 1px solid #333;

      border-radius: 8px;

      color: white;

      outline: none;

      font-size: 14px;

    }


    .woge-login-box input:focus {

      border-color: #d4af37;

      box-shadow:
        0 0 0 2px
        rgba(212,175,55,.10);

    }


    .woge-login-button {

      width: 100%;

      margin-top: 24px;

      padding: 13px;

      border: 0;

      border-radius: 8px;

      background:
        linear-gradient(
          135deg,
          #d4af37,
          #f2d36b
        );

      color: #151515;

      font-weight: 700;

      cursor: pointer;

    }


    .woge-login-button:hover {

      filter: brightness(1.08);

    }


    .woge-login-message {

      min-height: 20px;

      margin-top: 14px;

      text-align: center;

      color: #e6b84a;

      font-size: 12px;

    }


    .woge-login-footer {

      margin-top: 28px;

      text-align: center;

      color: #555;

      font-size: 9px;

      letter-spacing: 2px;

    }

  `;


  document.head.appendChild(
    style
  );

}


function showLoginScreen() {

  addLoginStyles();

  createLoginScreen();

  $("wogeLoginScreen")
    .style
    .display = "flex";

}


function hideLoginScreen() {

  if ($("wogeLoginScreen")) {

    $("wogeLoginScreen")
      .style
      .display = "none";

  }

}


/* =========================================================
   LOGIN
   ========================================================= */

async function loginUser(event) {

  event.preventDefault();


  const email =
    $("wogeLoginEmail")
      .value
      .trim();


  const password =
    $("wogeLoginPassword")
      .value;


  const message =
    $("wogeLoginMessage");


  message.textContent =
    "Signing in...";


  const {
    data,
    error
  } =
    await supabaseClient.auth
      .signInWithPassword({
        email,
        password
      });


  if (error) {

    message.textContent =
      error.message;

    return;

  }


  currentUser =
    data.user;


  message.textContent =
    "";


  hideLoginScreen();


  await startApplication();

}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logoutUser() {

  const confirmed =
    confirm(
      "Sign out of WOGE Orders?"
    );


  if (!confirmed) {

    return;

  }


  if (realtimeChannel) {

    await supabaseClient
      .removeChannel(
        realtimeChannel
      );

    realtimeChannel = null;

  }


  await supabaseClient.auth
    .signOut();


  orders = [];

  products = [];

  currentUser = null;


  showLoginScreen();

}


/* =========================================================
   LOAD PRODUCTS FROM SUPABASE
   ========================================================= */

async function loadProducts() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("products")
      .select("*")
      .eq("active", true)
      .order("name");


  if (error) {

    console.error(
      "Product loading error:",
      error
    );

    showDatabaseError(
      "Unable to load products."
    );

    return;

  }


  products =
    (data || [])
      .map(
        databaseProductToApp
      );


  populateProductDropdown();

  renderProducts();

}


/* =========================================================
   LOAD ORDERS FROM SUPABASE
   ========================================================= */

async function loadOrders() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("orders")
      .select("*")
      .order(
        "order_date",
        {
          ascending: false
        }
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      );


  if (error) {

    console.error(
      "Order loading error:",
      error
    );

    showDatabaseError(
      "Unable to load orders."
    );

    return;

  }


  orders =
    (data || [])
      .map(
        databaseOrderToApp
      );


  renderEverything();

}


/* =========================================================
   SAVE ORDER TO SUPABASE
   ========================================================= */

async function saveOrder(event) {

  event.preventDefault();

  if (!currentUser) {
    alert("Please sign in first.");
    return;
  }

  const editId = $("editId") ? $("editId").value : "";
  const qty = Math.max(1, Number($("qty")?.value) || 1);
  const productPrice = Number($("rate")?.value) || 0;
  const finalPrice = Math.max(0, Number($("finalPrice")?.value) || 0);
  const total = finalPrice * qty;
  const advance = Number($("advance")?.value) || 0;

  if (advance > total && total > 0) {
    alert("Advance Paid cannot be greater than Total Amount.");
    $("advance")?.focus();
    return;
  }

  let paymentStatus = $("paymentStatus") ? $("paymentStatus").value : "Unpaid";
  paymentStatus = calculatePaymentStatus(total, advance, paymentStatus);

  const productName = $("product")?.value || "";
  const selectedProduct = products.find(product => product.name === productName);

  const payload = {
    order_no: $("orderNo").value,
    order_date: $("orderDate").value || today(),
    customer_name: $("customer").value.trim(),
    mobile: $("mobile").value.trim() || null,
    product_id: selectedProduct ? selectedProduct.id : null,
    product_name: productName,
    quantity: qty,
    rate: productPrice,
    total_amount: total,
    advance_paid: advance,
    payment_status: paymentStatus,
    order_status: $("orderStatus").value || "Created",
    delivery_date: $("deliveryDate").value || null,
    payment_method: $("paymentMethod").value || null,
    delivery_type: $("deliveryType").value || null,
    notes: $("notes").value.trim() || null
  };

  let result;

  if (editId) {
    result = await supabaseClient.from("orders").update(payload).eq("id", editId).select().single();
  } else {
    result = await supabaseClient.from("orders").insert(payload).select().single();
  }

  if (result.error) {
    console.error("Save order error:", result.error);
    alert("Unable to save order:\n\n" + result.error.message);
    return;
  }

  closeModal();
  await loadOrders();
}

/* =========================================================
   DELETE ORDER
   ========================================================= */

async function deleteOrder(id) {

  const order =
    orders.find(
      item =>
        item.id === id
    );


  if (!order) {

    return;

  }


  const confirmed =
    confirm(
      `Delete order ${order.orderNo}?`
    );


  if (!confirmed) {

    return;

  }


  const {
    error
  } =
    await supabaseClient
      .from("orders")
      .delete()
      .eq("id", id);


  if (error) {

    console.error(
      "Delete order error:",
      error
    );

    alert(
      "Unable to delete order:\n\n" +
      error.message
    );

    return;

  }


  await loadOrders();

}


/* =========================================================
   PRODUCT DROPDOWN
   ========================================================= */

function populateProductDropdown() {

  if (!$("product")) return;

  const existingNames = new Set(products.map(product => product.name));
  const catalog = Object.keys(DEFAULT_PRODUCT_PRICES).map(name => ({
    id: "default-" + name,
    name,
    active: true,
    price: getProductPrice(name)
  }));

  const allProducts = products.concat(
    catalog.filter(product => !existingNames.has(product.name))
  );

  $("product").innerHTML = allProducts
    .filter(product => product.active)
    .map(product => {
      const price = getProductPrice(product.name);
      return `<option value="${escapeHTML(product.name)}" data-price="${price}">${escapeHTML(product.name)} — ${money(price)}</option>`;
    })
    .join("");

  setRateFromSelectedProduct();
}

/* =========================================================
   ADD PRODUCT
   ========================================================= */

async function addProduct() {

  const input = $("newProduct");
  const priceInput = $("newProductPrice");
  if (!input) return;

  const name = input.value.trim();
  const price = priceInput ? Number(priceInput.value) || 0 : 0;

  if (!name) {
    alert("Please enter a product name.");
    return;
  }

  if (price < 0) {
    alert("Product price cannot be negative.");
    return;
  }

  const { data, error } = await supabaseClient
    .from("products")
    .insert({ name })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") alert("This product already exists.");
    else alert("Unable to add product:\n\n" + error.message);
    return;
  }

  setCustomProductPrice(name, price);
  products.push(databaseProductToApp(data));
  input.value = "";
  if (priceInput) priceInput.value = "";
  populateProductDropdown();
  renderProducts();
}

/* =========================================================
   REMOVE PRODUCT
   ========================================================= */

async function removeProduct(
  productId
) {

  const product =
    products.find(
      item =>
        item.id ===
        productId
    );


  if (!product) {

    return;

  }


  const confirmed =
    confirm(
      `Remove "${product.name}" from the product list?`
    );


  if (!confirmed) {

    return;

  }


  /*
    We deactivate products rather than
    deleting them. Existing orders remain
    linked safely.
  */

  const {
    error
  } =
    await supabaseClient
      .from("products")
      .update({
        active: false
      })
      .eq(
        "id",
        productId
      );


  if (error) {

    alert(
      "Unable to remove product:\n\n" +
      error.message
    );

    return;

  }


  await loadProducts();

}


/* =========================================================
   OPEN ORDER
   ========================================================= */

function openOrder(id = null) {

  if (!$("modal")) {

    return;

  }


  $("modal")
    .classList
    .remove("hidden");


  if ($("editId")) {

    $("editId").value =
      id || "";

  }


  populateProductDropdown();


  if (id) {

    const order =
      orders.find(
        item =>
          item.id === id
      );


    if (!order) {

      closeModal();

      return;

    }


    if ($("modalTitle")) {

      $("modalTitle")
        .textContent =
        "Edit Order";

    }


    fillOrderForm(order);

  }

  else {

    if ($("modalTitle")) {

      $("modalTitle")
        .textContent =
        "New Order";

    }


    resetOrderForm();

  }


  updatePaymentFields();

}


/* =========================================================
   RESET ORDER FORM
   ========================================================= */

function resetOrderForm() {

  if (!$("orderForm")) {

    return;

  }


  $("orderForm").reset();


  if ($("editId")) {

    $("editId").value = "";

  }


  if ($("orderNo")) {

    $("orderNo").value =
      generateOrderNumber();

  }


  if ($("orderDate")) {

    $("orderDate").value =
      today();

  }


  if ($("qty")) {

    $("qty").value = 1;

  }


  if ($("rate")) {

    $("rate").value = 0;

  }


  if ($("finalPrice")) {

    $("finalPrice").value = 0;

  }


  if ($("total")) {

    $("total").value = 0;

  }


  if ($("advance")) {

    $("advance").value = 0;

  }


  if ($("paymentStatus")) {

    $("paymentStatus").value =
      "Unpaid";

  }


  if ($("orderStatus")) {

    $("orderStatus").value =
      "Created";

  }


  if ($("paymentMethod")) {

    $("paymentMethod").value =
      "Cash";

  }


  if ($("deliveryType")) {

    $("deliveryType").value =
      "Pickup";

  }


  if ($("deliveryDate")) {

    $("deliveryDate").value = "";

  }


  if ($("notes")) {

    $("notes").value = "";

  }


  updatePaymentFields();

}


/* =========================================================
   FILL EDIT FORM
   ========================================================= */

function fillOrderForm(order) {

  if ($("orderNo")) {

    $("orderNo").value =
      order.orderNo || "";

  }


  if ($("orderDate")) {

    $("orderDate").value =
      order.date || today();

  }


  if ($("customer")) {

    $("customer").value =
      order.customer || "";

  }


  if ($("mobile")) {

    $("mobile").value =
      order.mobile || "";

  }


  if ($("product")) {

    $("product").value =
      order.product || "";

  }


  if ($("qty")) {

    $("qty").value =
      order.qty || 1;

  }


  if ($("rate")) {

    $("rate").value =
      order.rate || getProductPrice(order.product);

  }


  if ($("finalPrice")) {

    const qty = Number(order.qty || 1) || 1;
    const savedFinal = order.finalPrice ?? (Number(order.total || 0) / qty);
    $("finalPrice").value = Number(savedFinal || 0).toFixed(2);

  }


  if ($("total")) {

    $("total").value =
      order.total || 0;

  }


  if ($("advance")) {

    $("advance").value =
      order.advance || 0;

  }


  if ($("paymentStatus")) {

    $("paymentStatus").value =
      order.paymentStatus ||
      "Unpaid";

  }


  if ($("orderStatus")) {

    $("orderStatus").value =
      order.orderStatus ||
      "Created";

  }


  if ($("deliveryDate")) {

    $("deliveryDate").value =
      order.deliveryDate || "";

  }


  if ($("paymentMethod")) {

    $("paymentMethod").value =
      order.paymentMethod ||
      "Cash";

  }


  if ($("deliveryType")) {

    $("deliveryType").value =
      order.deliveryType ||
      "Pickup";

  }


  if ($("notes")) {

    $("notes").value =
      order.notes || "";

  }


  updatePaymentFields();

}


/* =========================================================
   CLOSE MODAL
   ========================================================= */

function closeModal() {

  if ($("modal")) {

    $("modal")
      .classList
      .add("hidden");

  }

}


/* =========================================================
   TOTAL CALCULATION
   ========================================================= */

function autoCalculateTotal() {

  const qty = Math.max(1, Number($("qty")?.value) || 1);
  const finalPrice = Math.max(0, Number($("finalPrice")?.value) || 0);

  if ($("total")) {
    $("total").value = (qty * finalPrice).toFixed(2);
  }

  updatePaymentFields();
}

function setRateFromSelectedProduct() {

  if (!$("product")) return;

  const name = $("product").value;
  const price = getProductPrice(name);

  if ($("rate")) $("rate").value = price;
  if ($("finalPrice")) $("finalPrice").value = price;

  autoCalculateTotal();
}


/* =========================================================
   PAYMENT FIELD UPDATE
   ========================================================= */

function updatePaymentFields() {

  if (!$("total")) {

    return;

  }


  const total =
    Number(
      $("total").value
    ) || 0;


  const advance =
    Number(
      $("advance")
        ? $("advance").value
        : 0
    ) || 0;


  const selected =
    $("paymentStatus")
      ? $("paymentStatus").value
      : "Unpaid";


  const status =
    calculatePaymentStatus(
      total,
      advance,
      selected
    );


  if ($("paymentStatus")) {

    $("paymentStatus").value =
      status;

  }


  if ($("balancePreview")) {

    $("balancePreview")
      .textContent =
      money(
        calculateBalance(
          total,
          advance
        )
      );

  }

}


/* =========================================================
   DASHBOARD
   ========================================================= */

function renderDashboard() {

  const todayOrders =
    orders.filter(
      order =>
        order.date ===
        today()
    );


  const totals =
    calculateTotals(
      todayOrders
    );


  const activeOrders =
    orders.filter(
      order =>
        ![
          "Delivered",
          "RTO"
        ].includes(
          order.orderStatus
        )
    );


  if ($("dashCards")) {

    $("dashCards").innerHTML =

      dashboardCard(
        "Today's Orders",
        todayOrders.length
      ) +

      dashboardCard(
        "Today's Sales",
        money(totals.total)
      ) +

      dashboardCard(
        "Advance Collected",
        money(totals.advance)
      ) +

      dashboardCard(
        "Outstanding",
        money(totals.balance)
      ) +

      dashboardCard(
        "Active Orders",
        activeOrders.length
      );

  }


  if ($("recentOrders")) {

    $("recentOrders").innerHTML =
      createOrdersTable(
        orders.slice(0, 8)
      );

  }

}


/* =========================================================
   DASHBOARD CARD
   ========================================================= */

function dashboardCard(
  label,
  value
) {

  return `

    <div class="card">

      <div class="label">
        ${escapeHTML(label)}
      </div>

      <div class="value">
        ${escapeHTML(value)}
      </div>

    </div>

  `;

}


/* =========================================================
   ORDERS
   ========================================================= */

function renderOrders() {

  if (!$("ordersTable")) {

    return;

  }


  const search =
    $("search")
      ? $("search")
          .value
          .trim()
          .toLowerCase()
      : "";


  const statusFilter =
    $("statusFilter")
      ? $("statusFilter").value
      : "";


  const paymentFilter =
    $("paymentFilter")
      ? $("paymentFilter").value
      : "";


  const filtered =
    orders.filter(
      order => {

        const searchable =
          [
            order.orderNo,
            order.customer,
            order.mobile,
            order.product
          ]
            .join(" ")
            .toLowerCase();


        return (

          (!search ||
            searchable.includes(
              search
            ))

          &&

          (!statusFilter ||
            order.orderStatus ===
              statusFilter)

          &&

          (!paymentFilter ||
            order.paymentStatus ===
              paymentFilter)

        );

      }
    );


  $("ordersTable").innerHTML =
    createOrdersTable(
      filtered
    );

}


/* =========================================================
   DAILY
   ========================================================= */

function renderDaily() {

  if (!$("dailyDate")) {

    return;

  }


  const date =
    $("dailyDate").value ||
    today();


  const list =
    orders.filter(
      order =>
        order.date === date
    );


  if ($("dailyTable")) {

    $("dailyTable").innerHTML =
      createOrdersTable(
        list
      );

  }

}


/* =========================================================
   WEEK RANGE
   ========================================================= */

function getWeekRange(
  dateString
) {

  const date =
    new Date(
      `${dateString}T00:00:00`
    );


  const day =
    date.getDay();


  const difference =
    day === 0
      ? -6
      : 1 - day;


  const start =
    new Date(date);


  start.setDate(
    date.getDate() +
    difference
  );


  const end =
    new Date(start);


  end.setDate(
    start.getDate() +
    6
  );


  return {

    start:
      start
        .toISOString()
        .slice(0, 10),

    end:
      end
        .toISOString()
        .slice(0, 10)

  };

}


/* =========================================================
   WEEKLY
   ========================================================= */

function renderWeekly() {

  if (!$("weekDate")) {

    return;

  }


  const date =
    $("weekDate").value ||
    today();


  const range =
    getWeekRange(
      date
    );


  const list =
    orders.filter(
      order =>
        order.date >= range.start &&
        order.date <= range.end
    );


  const totals =
    calculateTotals(
      list
    );


  if ($("weeklyCards")) {

    $("weeklyCards").innerHTML =

      dashboardCard(
        "Orders",
        list.length
      ) +

      dashboardCard(
        "Sales",
        money(totals.total)
      ) +

      dashboardCard(
        "Advance",
        money(totals.advance)
      ) +

      dashboardCard(
        "Outstanding",
        money(totals.balance)
      );

  }


  if ($("weeklyTable")) {

    $("weeklyTable").innerHTML =
      createSummaryTable(
        list
      );

  }

}


/* =========================================================
   MONTHLY
   ========================================================= */

function renderMonthly() {

  if (!$("monthDate")) {

    return;

  }


  const month =
    $("monthDate").value ||
    currentMonth();


  const list =
    orders.filter(
      order =>
        order.date.startsWith(
          month
        )
    );


  const totals =
    calculateTotals(
      list
    );


  const delivered =
    list.filter(
      order =>
        order.orderStatus ===
        "Delivered"
    ).length;


  const rto =
    list.filter(
      order =>
        order.orderStatus ===
        "RTO"
    ).length;


  if ($("monthlyCards")) {

    $("monthlyCards").innerHTML =

      dashboardCard(
        "Orders",
        list.length
      ) +

      dashboardCard(
        "Sales",
        money(totals.total)
      ) +

      dashboardCard(
        "Advance",
        money(totals.advance)
      ) +

      dashboardCard(
        "Outstanding",
        money(totals.balance)
      ) +

      dashboardCard(
        "Delivered",
        delivered
      ) +

      dashboardCard(
        "RTO",
        rto
      );

  }


  if ($("monthlyTable")) {

    $("monthlyTable").innerHTML =
      createSummaryTable(
        list
      );

  }

}


/* =========================================================
   TOTALS
   ========================================================= */

function calculateTotals(
  list
) {

  let total = 0;

  let advance = 0;

  let balance = 0;


  list.forEach(
    order => {

      total +=
        Number(
          order.total || 0
        );


      advance +=
        Number(
          order.advance || 0
        );


      balance +=
        Number(
          order.balance ??
          calculateBalance(
            order.total,
            order.advance
          )
        );

    }
  );


  return {

    total,

    advance,

    balance

  };

}


/* =========================================================
   ORDER TABLE
   ========================================================= */

function createOrdersTable(
  list
) {

  if (!list.length) {

    return `

      <div class="empty-state">

        No orders found.

      </div>

    `;

  }


  return `

    <div class="table-wrap">

      <table class="table">

        <thead>

          <tr>

            <th>Order</th>

            <th>Date</th>

            <th>Customer</th>

            <th>Product</th>

            <th>Product Price</th>

            <th>Final Price</th>

            <th>Total</th>

            <th>Advance</th>

            <th>Balance</th>

            <th>Payment</th>

            <th>Status</th>

            <th>Action</th>

          </tr>

        </thead>


        <tbody>

          ${list
            .map(
              createOrderRow
            )
            .join("")}

        </tbody>

      </table>

    </div>

  `;

}


/* =========================================================
   ORDER ROW
   ========================================================= */

function createOrderRow(
  order
) {

  const balance =
    order.balance ??
    calculateBalance(
      order.total,
      order.advance
    );


  return `

    <tr>

      <td>

        <strong>
          ${escapeHTML(order.orderNo)}
        </strong>

      </td>


      <td>
        ${escapeHTML(order.date)}
      </td>


      <td>

        <strong>
          ${escapeHTML(order.customer)}
        </strong>

        ${
          order.mobile
            ? `<br>
               <small>
                 ${escapeHTML(order.mobile)}
               </small>`
            : ""
        }

      </td>


      <td>

        ${escapeHTML(order.product)}

        <br>

        <small>
          Qty: ${escapeHTML(order.qty)}
        </small>

      </td>


      <td>
        ${money(order.rate)}
      </td>


      <td>
        ${money(order.finalPrice ?? (Number(order.qty || 1) > 0 ? Number(order.total || 0) / Number(order.qty || 1) : 0))}
      </td>


      <td>
        ${money(order.total)}
      </td>


      <td>
        ${money(order.advance)}
      </td>


      <td>
        ${money(balance)}
      </td>


      <td>

        <span class="pill">

          ${escapeHTML(
            order.paymentStatus
          )}

        </span>

      </td>


      <td>

        <span class="pill">

          ${escapeHTML(
            order.orderStatus
          )}

        </span>

      </td>


      <td>

        <button
          class="action"
          onclick="openOrder('${escapeHTML(order.id)}')"
        >
          Edit
        </button>


        <button
          class="action danger"
          onclick="deleteOrder('${escapeHTML(order.id)}')"
        >
          Delete
        </button>

      </td>

    </tr>

  `;

}


/* =========================================================
   SUMMARY TABLE
   ========================================================= */

function createSummaryTable(
  list
) {

  if (!list.length) {

    return `

      <div class="empty-state">

        No orders for this period.

      </div>

    `;

  }


  const daily = {};


  list.forEach(
    order => {

      if (!daily[order.date]) {

        daily[order.date] = {

          count: 0,

          total: 0,

          advance: 0,

          balance: 0

        };

      }


      daily[order.date].count++;


      daily[order.date].total +=
        Number(
          order.total || 0
        );


      daily[order.date].advance +=
        Number(
          order.advance || 0
        );


      daily[order.date].balance +=
        Number(
          order.balance ??
          calculateBalance(
            order.total,
            order.advance
          )
        );

    }
  );


  const dates =
    Object.keys(daily)
      .sort();


  return `

    <div class="table-wrap">

      <table class="table">

        <thead>

          <tr>

            <th>Date</th>

            <th>Orders</th>

            <th>Sales</th>

            <th>Advance</th>

            <th>Outstanding</th>

          </tr>

        </thead>


        <tbody>

          ${dates
            .map(
              date => {

                const row =
                  daily[date];


                return `

                  <tr>

                    <td>
                      ${escapeHTML(date)}
                    </td>

                    <td>
                      ${row.count}
                    </td>

                    <td>
                      ${money(row.total)}
                    </td>

                    <td>
                      ${money(row.advance)}
                    </td>

                    <td>
                      ${money(row.balance)}
                    </td>

                  </tr>

                `;

              }
            )
            .join("")}

        </tbody>

      </table>

    </div>

  `;

}


/* =========================================================
   PRODUCTS
   ========================================================= */

function renderProducts() {

  if (!$("productList")) return;

  const existingNames = new Set(products.map(product => product.name));
  const catalog = Object.keys(DEFAULT_PRODUCT_PRICES).map(name => ({
    id: "default-" + name,
    name,
    active: true
  }));
  const allProducts = products.concat(catalog.filter(product => !existingNames.has(product.name)));

  $("productList").innerHTML = allProducts.filter(product => product.active).map(product => {
    const price = getProductPrice(product.name);
    const removable = !String(product.id).startsWith("default-");
    return `
      <div class="product-row">
        <div><strong>${escapeHTML(product.name)}</strong><span style="margin-left:12px;">${money(price)}</span></div>
        ${removable ? `<button class="action danger" onclick="removeProduct('${escapeHTML(product.id)}')">Remove</button>` : ""}
      </div>
    `;
  }).join("");
}

/* =========================================================
   PRINT / SAVE DASHBOARD PDF
   ========================================================= */

function printDashboardReport() {

  const todayOrders = orders.filter(order => order.date === today());
  const totals = calculateTotals(todayOrders);
  const activeOrders = orders.filter(order => !["Delivered", "RTO"].includes(order.orderStatus));

  const rows = orders.slice(0, 50).map(order => {
    const finalPrice = order.finalPrice ?? (Number(order.qty || 1) > 0 ? Number(order.total || 0) / Number(order.qty || 1) : 0);
    const balance = order.balance ?? calculateBalance(order.total, order.advance);
    return `<tr><td>${escapeHTML(order.orderNo)}</td><td>${escapeHTML(formatDisplayDate(order.date))}</td><td>${escapeHTML(order.customer)}</td><td>${escapeHTML(order.product)}</td><td class="right">${money(order.rate)}</td><td class="right">${money(finalPrice)}</td><td class="right">${money(order.total)}</td><td class="right">${money(order.advance)}</td><td class="right">${money(balance)}</td><td>${escapeHTML(order.orderStatus || "")}</td></tr>`;
  }).join("");

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow pop-ups to print or save the dashboard PDF.");
    return;
  }

  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>WOGE Order Manager Dashboard</title><style>
@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#161616;background:#fff;font-size:9px}.header{border-bottom:3px solid #c9a227;padding-bottom:10px;margin-bottom:12px}.brand{font-size:10px;font-weight:700;letter-spacing:2px}h1{margin:3px 0 2px;font-family:Georgia,serif;font-size:24px}.sub{color:#666;font-size:9px}.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin:12px 0}.card{border:1px solid #d6d6d6;border-radius:5px;padding:9px}.label{color:#666;text-transform:uppercase;font-size:7px;letter-spacing:1px}.value{font-size:14px;font-weight:700;margin-top:5px}table{width:100%;border-collapse:collapse;margin-top:10px}th{background:#151515;color:#fff;text-align:left;font-size:7px;text-transform:uppercase;letter-spacing:.5px;padding:6px 5px}td{border-bottom:1px solid #ddd;padding:5px;vertical-align:top}.right{text-align:right}.footer{margin-top:12px;border-top:1px solid #ccc;padding-top:7px;display:flex;justify-content:space-between;color:#777;font-size:7px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="header"><div class="brand">WORD OF GOD ENTERPRISES</div><h1>WOGE ORDER MANAGER</h1><div class="sub">Dashboard Report • ${escapeHTML(formatDisplayDate(today()))}</div></div><div class="cards"><div class="card"><div class="label">Today’s Orders</div><div class="value">${todayOrders.length}</div></div><div class="card"><div class="label">Today’s Sales</div><div class="value">${money(totals.total)}</div></div><div class="card"><div class="label">Advance Collected</div><div class="value">${money(totals.advance)}</div></div><div class="card"><div class="label">Outstanding</div><div class="value">${money(totals.balance)}</div></div><div class="card"><div class="label">Active Orders</div><div class="value">${activeOrders.length}</div></div></div><table><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Product</th><th>Product Price</th><th>Final Price</th><th>Total</th><th>Advance</th><th>Balance</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="10" style="text-align:center">No orders found.</td></tr>'}</tbody></table><div class="footer"><span>WORD OF GOD ENTERPRISES • WOGE ORDER MANAGER</span><span>Generated: ${escapeHTML(new Date().toLocaleString("en-IN"))}</span></div><script>window.onload=function(){setTimeout(function(){window.print();},400);};<\/script></body></html>`);

  printWindow.document.close();
}

function formatDisplayDate(date) {
  if (!date) return "";
  const parts = String(date).split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(date);
}


/* =========================================================
   REALTIME SYNCHRONIZATION
   ========================================================= */

function startRealtime() {

  if (realtimeChannel) {

    supabaseClient
      .removeChannel(
        realtimeChannel
      );

    realtimeChannel = null;

  }


  realtimeChannel =
    supabaseClient
      .channel(
        "woge-orders-realtime"
      )


      /* ==============================================
         ORDERS
         ============================================== */

      .on(

        "postgres_changes",

        {
          event: "*",

          schema: "public",

          table: "orders"

        },

        async payload => {

          console.log(
            "Realtime order change:",
            payload
          );


          await loadOrders();

        }

      )


      /* ==============================================
         PRODUCTS
         ============================================== */

      .on(

        "postgres_changes",

        {
          event: "*",

          schema: "public",

          table: "products"

        },

        async payload => {

          console.log(
            "Realtime product change:",
            payload
          );


          await loadProducts();

        }

      )


      .subscribe(
        status => {

          console.log(
            "Realtime status:",
            status
          );

        }
      );

}


/* =========================================================
   AUTH STATE
   ========================================================= */

function setupAuthListener() {

  supabaseClient.auth
    .onAuthStateChange(
      async (
        event,
        session
      ) => {

        console.log(
          "Auth event:",
          event
        );


        if (session?.user) {

          currentUser =
            session.user;

          hideLoginScreen();

        }

        else {

          currentUser = null;

          showLoginScreen();

        }

      }
    );

}


/* =========================================================
   LOGOUT BUTTON
   ========================================================= */

function addLogoutButton() {

  /*
    We intentionally add a small logout
    button to the page rather than changing
    your existing HTML layout.
  */


  if (
    document.getElementById(
      "wogeLogoutButton"
    )
  ) {

    return;

  }


  const button =
    document.createElement("button");


  button.id =
    "wogeLogoutButton";


  button.textContent =
    "Logout";


  button.onclick =
    logoutUser;


  button.style.cssText = `

    position: fixed;

    bottom: 18px;

    right: 18px;

    z-index: 9000;

    padding: 8px 14px;

    border-radius: 7px;

    border: 1px solid
      rgba(212,175,55,.45);

    background: #111;

    color: #d4af37;

    font-size: 11px;

    cursor: pointer;

  `;


  document.body.appendChild(
    button
  );

}


/* =========================================================
   SETUP DROPDOWNS
   ========================================================= */

function setupDropdowns() {

  if ($("orderStatus")) {

    $("orderStatus").innerHTML =
      ORDER_STATUSES
        .map(
          status =>
            `<option value="${escapeHTML(status)}">
              ${escapeHTML(status)}
            </option>`
        )
        .join("");

  }


  if ($("statusFilter")) {

    $("statusFilter").innerHTML =

      `<option value="">
        All Order Status
      </option>` +

      ORDER_STATUSES
        .map(
          status =>
            `<option value="${escapeHTML(status)}">
              ${escapeHTML(status)}
            </option>`
        )
        .join("");

  }


  if ($("paymentStatus")) {

    $("paymentStatus").innerHTML =

      PAYMENT_STATUSES
        .map(
          status =>
            `<option value="${escapeHTML(status)}">
              ${escapeHTML(status)}
            </option>`
        )
        .join("");

  }


  if ($("paymentFilter")) {

    $("paymentFilter").innerHTML =

      `<option value="">
        All Payment Status
      </option>` +

      PAYMENT_STATUSES
        .map(
          status =>
            `<option value="${escapeHTML(status)}">
              ${escapeHTML(status)}
            </option>`
        )
        .join("");

  }


  if ($("paymentMethod")) {

    $("paymentMethod").innerHTML =
      PAYMENT_METHODS
        .map(
          method =>
            `<option value="${escapeHTML(method)}">
              ${escapeHTML(method)}
            </option>`
        )
        .join("");

  }


  if ($("deliveryType")) {

    $("deliveryType").innerHTML =
      DELIVERY_TYPES
        .map(
          type =>
            `<option value="${escapeHTML(type)}">
              ${escapeHTML(type)}
            </option>`
        )
        .join("");

  }


  populateProductDropdown();

}


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function setupEvents() {


  /* Navigation */

  document
    .querySelectorAll(".tab")
    .forEach(
      button => {

        button.addEventListener(
          "click",
          function () {

            showPage(
              this.dataset.page
            );

          }
        );

      }
    );


  /* Order form */

  if ($("orderForm")) {

    $("orderForm")
      .addEventListener(
        "submit",
        saveOrder
      );

  }


  /* Quantity */

  if ($("qty")) {

    $("qty")
      .addEventListener(
        "input",
        autoCalculateTotal
      );

  }


  /* Product */

  if ($("product")) {

    $("product")
      .addEventListener(
        "change",
        setRateFromSelectedProduct
      );

  }


  /* Final Price */

  if ($("finalPrice")) {

    $("finalPrice")
      .addEventListener(
        "input",
        autoCalculateTotal
      );

  }


  /* Total */

  if ($("total")) {

    $("total")
      .addEventListener(
        "input",
        updatePaymentFields
      );

  }


  /* Advance */

  if ($("advance")) {

    $("advance")
      .addEventListener(
        "input",
        updatePaymentFields
      );

  }


  /* Payment status */

  if ($("paymentStatus")) {

    $("paymentStatus")
      .addEventListener(
        "change",
        updatePaymentFields
      );

  }


  /* Search */

  if ($("search")) {

    $("search")
      .addEventListener(
        "input",
        renderOrders
      );

  }


  /* Status filter */

  if ($("statusFilter")) {

    $("statusFilter")
      .addEventListener(
        "change",
        renderOrders
      );

  }


  /* Payment filter */

  if ($("paymentFilter")) {

    $("paymentFilter")
      .addEventListener(
        "change",
        renderOrders
      );

  }


  /* Daily date */

  if ($("dailyDate")) {

    $("dailyDate")
      .addEventListener(
        "change",
        renderDaily
      );

  }


  /* Weekly date */

  if ($("weekDate")) {

    $("weekDate")
      .addEventListener(
        "change",
        renderWeekly
      );

  }


  /* Monthly date */

  if ($("monthDate")) {

    $("monthDate")
      .addEventListener(
        "change",
        renderMonthly
      );

  }


  /* Escape closes modal */

  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key ===
        "Escape"
      ) {

        closeModal();

      }


      if (
        event.ctrlKey &&
        event.key.toLowerCase() ===
          "n"
      ) {

        event.preventDefault();

        openOrder();

      }

    }
  );


  /* Click outside modal */

  document.addEventListener(
    "click",
    event => {

      const modal =
        $("modal");


      if (
        modal &&
        event.target === modal
      ) {

        closeModal();

      }

    }
  );

}


/* =========================================================
   PAGE NAVIGATION
   ========================================================= */

function showPage(
  pageName
) {

  document
    .querySelectorAll(".page")
    .forEach(
      page => {

        page.classList.remove(
          "active"
        );

      }
    );


  document
    .querySelectorAll(".tab")
    .forEach(
      tab => {

        tab.classList.remove(
          "active"
        );

      }
    );


  const page =
    $(pageName);


  if (page) {

    page.classList.add(
      "active"
    );

  }


  const activeTab =
    document.querySelector(
      `.tab[data-page="${pageName}"]`
    );


  if (activeTab) {

    activeTab.classList.add(
      "active"
    );

  }


  renderEverything();

}


/* =========================================================
   RENDER EVERYTHING
   ========================================================= */

function renderEverything() {

  renderDashboard();

  renderOrders();

  renderDaily();

  renderWeekly();

  renderMonthly();

  renderProducts();

}


/* =========================================================
   DATABASE ERROR
   ========================================================= */

function showDatabaseError(
  message
) {

  console.error(
    message
  );


  const existing =
    document.getElementById(
      "wogeDatabaseError"
    );


  if (existing) {

    existing.textContent =
      message;

    return;

  }


  const error =
    document.createElement("div");


  error.id =
    "wogeDatabaseError";


  error.textContent =
    message;


  error.style.cssText = `

    position: fixed;

    top: 15px;

    left: 50%;

    transform: translateX(-50%);

    z-index: 99999;

    padding: 10px 18px;

    border: 1px solid
      #8d6d20;

    border-radius: 8px;

    background: #181818;

    color: #e4bd4e;

    font-size: 12px;

  `;


  document.body.appendChild(
    error
  );

}


/* =========================================================
   START APPLICATION
   ========================================================= */

async function startApplication() {

  console.log(
    "Starting WOGE Order Manager..."
  );


  setupDropdowns();

  setupEvents();

  addLogoutButton();


  if ($("dailyDate")) {

    $("dailyDate").value =
      today();

  }


  if ($("weekDate")) {

    $("weekDate").value =
      today();

  }


  if ($("monthDate")) {

    $("monthDate").value =
      currentMonth();

  }


  await loadProducts();

  await loadOrders();


  startRealtime();


  console.log(
    "WOGE Order Manager ready."
  );

}


/* =========================================================
   APPLICATION BOOT
   ========================================================= */

async function boot() {

  console.log(
    "WOGE Cloud Application booting..."
  );


  addLoginStyles();

  createLoginScreen();

  setupAuthListener();


  const {
    data
  } =
    await supabaseClient.auth
      .getSession();


  if (
    data &&
    data.session &&
    data.session.user
  ) {

    currentUser =
      data.session.user;


    hideLoginScreen();


    await startApplication();

  }

  else {

    showLoginScreen();

  }

}


/* =========================================================
   GLOBAL FUNCTIONS
   =========================================================

   These are intentionally exposed so
   your existing HTML onclick="" buttons
   continue working.
   ========================================================= */

window.openOrder =
  openOrder;

window.closeModal =
  closeModal;

window.deleteOrder =
  deleteOrder;

window.addProduct =
  addProduct;

window.removeProduct =
  removeProduct;

window.showPage =
  showPage;

window.logoutUser =
  logoutUser;

window.updatePaymentFields =
  updatePaymentFields;

window.autoCalculateTotal =
  autoCalculateTotal;

window.printDashboardReport =
  printDashboardReport;


/* =========================================================
   GO
   ========================================================= */

boot();
