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

  let parsedItems = [];
  try {
    if (Array.isArray(row.items)) parsedItems = row.items;
    else if (typeof row.items === "string" && row.items.trim()) parsedItems = JSON.parse(row.items);
  } catch (error) {
    parsedItems = [];
  }

  const legacyQty = Number(row.quantity || 1) || 1;
  const legacyTotal = Number(row.total_amount || 0);
  const legacyFinal = row.final_price !== null && row.final_price !== undefined
    ? Number(row.final_price || 0)
    : (legacyQty > 0 ? legacyTotal / legacyQty : legacyTotal);

  if (!Array.isArray(parsedItems) || !parsedItems.length) {
    parsedItems = [{
      productId: row.product_id || null,
      product: row.product_name || "",
      qty: legacyQty,
      rate: Number(row.rate || 0),
      finalPrice: legacyFinal,
      total: legacyTotal
    }];
  }

  return {
    id: row.id,
    orderNo: row.order_no,
    date: row.order_date,
    customer: row.customer_name,
    mobile: row.mobile || "",
    product: row.product_name,
    productId: row.product_id,
    qty: legacyQty,
    rate: Number(row.rate || 0),
    total: legacyTotal,
    finalPrice: legacyFinal,
    items: parsedItems.map(item => ({
      productId: item.productId || null,
      product: item.product || item.productName || "",
      qty: Math.max(1, Number(item.qty || item.quantity || 1) || 1),
      rate: Math.max(0, Number(item.rate || 0) || 0),
      finalPrice: Math.max(0, Number(item.finalPrice ?? item.final_price ?? 0) || 0),
      total: Math.max(0, Number(item.total ?? 0) || 0)
    })),
    advance: Number(row.advance_paid || 0),
    balance: Number(row.balance_due || 0),
    paymentStatus: row.payment_status,
    orderStatus: row.order_status,
    deliveryDate: row.delivery_date || "",
    paymentMethod: row.payment_method || "",
    deliveryType: row.delivery_type || "",
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
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
  const items = collectOrderItems();

  if (!items.length) {
    alert("Please add at least one product.");
    return;
  }

  const total = items.reduce((sum, item) => sum + (item.finalPrice * item.qty), 0);
  const advance = Number($("advance")?.value) || 0;

  if (advance > total && total > 0) {
    alert("Advance Paid cannot be greater than Total Amount.");
    $("advance")?.focus();
    return;
  }

  let paymentStatus = $("paymentStatus") ? $("paymentStatus").value : "Unpaid";
  paymentStatus = calculatePaymentStatus(total, advance, paymentStatus);

  const firstItem = items[0];
  const productNames = items.map(item => item.product).filter(Boolean);
  const productName = productNames.length === 1 ? productNames[0] : productNames.join(" + ");
  const standardTotal = items.reduce((sum, item) => sum + (item.rate * item.qty), 0);

  const payload = {
    order_no: $("orderNo").value,
    order_date: $("orderDate").value || today(),
    customer_name: $("customer").value.trim(),
    mobile: $("mobile").value.trim() || null,
    product_id: firstItem.productId || null,
    product_name: productName,
    quantity: items.reduce((sum, item) => sum + item.qty, 0),
    rate: standardTotal,
    total_amount: total,
    final_price: firstItem.finalPrice,
    items: items,
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
  if ($('orderItems')) {
    const current = collectOrderItems();
    renderOrderItems(current.length ? current : undefined);
    return;
  }
  if (!$('product')) return;
  $('product').innerHTML = productOptionsHTML($('product').value);
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
  if (!$('orderForm')) return;

  $('orderForm').reset();
  if ($('editId')) $('editId').value = '';
  if ($('orderNo')) $('orderNo').value = generateOrderNumber();
  if ($('orderDate')) $('orderDate').value = today();
  if ($('advance')) $('advance').value = 0;
  if ($('paymentStatus')) $('paymentStatus').value = 'Unpaid';
  if ($('orderStatus')) $('orderStatus').value = 'Created';
  if ($('paymentMethod')) $('paymentMethod').value = 'Cash';
  if ($('deliveryType')) $('deliveryType').value = 'Pickup';
  if ($('deliveryDate')) $('deliveryDate').value = '';
  if ($('notes')) $('notes').value = '';

  renderOrderItems([{ product: getDefaultProductName(), qty: 1, rate: getProductPrice(getDefaultProductName()), finalPrice: getProductPrice(getDefaultProductName()) }]);
  updatePaymentFields();
}

/* =========================================================
   FILL EDIT FORM
   ========================================================= */

function fillOrderForm(order) {
  if ($('orderNo')) $('orderNo').value = order.orderNo || '';
  if ($('orderDate')) $('orderDate').value = normalizeDateValue(order.date || today());
  if ($('customer')) $('customer').value = order.customer || '';
  if ($('mobile')) $('mobile').value = order.mobile || '';

  const items = Array.isArray(order.items) && order.items.length
    ? order.items
    : [{
        product: order.product || getDefaultProductName(),
        productId: order.productId || null,
        qty: order.qty || 1,
        rate: order.rate || getProductPrice(order.product),
        finalPrice: order.finalPrice ?? (Number(order.total || 0) / Math.max(1, Number(order.qty || 1))),
        total: order.total || 0
      }];

  renderOrderItems(items);

  if ($('advance')) $('advance').value = order.advance || 0;
  if ($('paymentStatus')) $('paymentStatus').value = order.paymentStatus || 'Unpaid';
  if ($('orderStatus')) $('orderStatus').value = order.orderStatus || 'Created';
  if ($('deliveryDate')) $('deliveryDate').value = normalizeDateValue(order.deliveryDate || '');
  if ($('paymentMethod')) $('paymentMethod').value = order.paymentMethod || 'Cash';
  if ($('deliveryType')) $('deliveryType').value = order.deliveryType || 'Pickup';
  if ($('notes')) $('notes').value = order.notes || '';

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
   MULTI-PRODUCT ORDER ITEMS
   ========================================================= */

function getAllCatalogProducts() {
  const existingNames = new Set(products.map(product => product.name));
  const catalog = Object.keys(DEFAULT_PRODUCT_PRICES).map(name => ({
    id: 'default-' + name,
    name,
    active: true,
    price: getProductPrice(name)
  }));
  return products.concat(catalog.filter(product => !existingNames.has(product.name)));
}

function getDefaultProductName() {
  const catalog = getAllCatalogProducts().filter(product => product.active);
  return catalog.length ? catalog[0].name : '';
}

function productOptionsHTML(selectedName) {
  return getAllCatalogProducts()
    .filter(product => product.active)
    .map(product => {
      const selected = product.name === selectedName ? ' selected' : '';
      const price = getProductPrice(product.name);
      return `<option value="${escapeHTML(product.name)}" data-product-id="${escapeHTML(product.id)}" data-price="${price}"${selected}>${escapeHTML(product.name)} — ${money(price)}</option>`;
    }).join('');
}

function renderOrderItems(items) {
  const container = $('orderItems');
  if (!container) return;

  const source = Array.isArray(items) && items.length ? items : [{ product: getDefaultProductName(), qty: 1 }];

  container.innerHTML = source.map((item, index) => {
    const product = item.product || item.productName || getDefaultProductName();
    const rate = Number(item.rate ?? getProductPrice(product)) || 0;
    const finalPrice = Number(item.finalPrice ?? item.final_price ?? rate) || 0;
    const qty = Math.max(1, Number(item.qty ?? item.quantity ?? 1) || 1);
    const lineTotal = finalPrice * qty;
    return `
      <div class="order-item" data-index="${index}">
        <div class="order-item-grid">
          <label class="order-item-product">
            Product
            <select class="item-product" data-index="${index}" onchange="orderItemProductChanged(this)" required>
              ${productOptionsHTML(product)}
            </select>
          </label>
          <label>
            Quantity
            <input class="item-qty" data-index="${index}" type="number" min="1" step="1" value="${qty}" oninput="recalculateOrderItems()" required>
          </label>
          <label>
            Product Price
            <input class="item-rate" data-index="${index}" type="number" min="0" step="0.01" value="${rate.toFixed(2)}" readonly>
            <span class="price-help">Standard price</span>
          </label>
          <label>
            Final Price
            <input class="item-final" data-index="${index}" type="number" min="0" step="0.01" value="${finalPrice.toFixed(2)}" oninput="recalculateOrderItems()" required>
            <span class="price-help">Given/discounted price per item</span>
          </label>
          <div class="order-item-total">
            <span>Line Total</span>
            <strong class="item-line-total">${money(lineTotal)}</strong>
          </div>
          <button type="button" class="remove-item-btn" onclick="removeOrderItem(${index})" ${source.length === 1 ? 'disabled' : ''}>Remove</button>
        </div>
      </div>`;
  }).join('');

  recalculateOrderItems();
}

function collectOrderItems() {
  const container = $('orderItems');
  if (!container) return [];

  return [...container.querySelectorAll('.order-item')].map(row => {
    const select = row.querySelector('.item-product');
    const qty = Math.max(1, Number(row.querySelector('.item-qty')?.value) || 1);
    const rate = Math.max(0, Number(row.querySelector('.item-rate')?.value) || 0);
    const finalPrice = Math.max(0, Number(row.querySelector('.item-final')?.value) || 0);
    return {
      productId: select?.selectedOptions?.[0]?.dataset?.productId || null,
      product: select?.value || '',
      qty,
      rate,
      finalPrice,
      total: finalPrice * qty
    };
  }).filter(item => item.product);
}

function recalculateOrderItems() {
  const container = $('orderItems');
  if (!container) return;

  let total = 0;
  container.querySelectorAll('.order-item').forEach(row => {
    const qty = Math.max(1, Number(row.querySelector('.item-qty')?.value) || 1);
    const finalPrice = Math.max(0, Number(row.querySelector('.item-final')?.value) || 0);
    const lineTotal = qty * finalPrice;
    total += lineTotal;
    const line = row.querySelector('.item-line-total');
    if (line) line.textContent = money(lineTotal);
  });

  if ($('total')) $('total').value = total.toFixed(2);
  updatePaymentFields();
}

function orderItemProductChanged(select) {
  const row = select.closest('.order-item');
  if (!row) return;
  const price = getProductPrice(select.value);
  const rate = row.querySelector('.item-rate');
  const final = row.querySelector('.item-final');
  if (rate) rate.value = price.toFixed(2);
  if (final) final.value = price.toFixed(2);
  recalculateOrderItems();
}

function addOrderItem() {
  const items = collectOrderItems();
  const defaultName = getDefaultProductName();
  items.push({ product: defaultName, qty: 1, rate: getProductPrice(defaultName), finalPrice: getProductPrice(defaultName) });
  renderOrderItems(items);
}

function removeOrderItem(index) {
  const items = collectOrderItems();
  if (items.length <= 1) return;
  items.splice(index, 1);
  renderOrderItems(items);
}

/* =========================================================
   TOTAL CALCULATION
   ========================================================= */

function autoCalculateTotal() {
  if ($('orderItems')) recalculateOrderItems();
  else if ($('total')) {
    const qty = Math.max(1, Number($('qty')?.value) || 1);
    const finalPrice = Math.max(0, Number($('finalPrice')?.value) || 0);
    $('total').value = (qty * finalPrice).toFixed(2);
  }
  updatePaymentFields();
}

function setRateFromSelectedProduct() {
  if ($('orderItems')) {
    recalculateOrderItems();
    return;
  }
  if (!$('product')) return;
  const name = $('product').value;
  const price = getProductPrice(name);
  if ($('rate')) $('rate').value = price;
  if ($('finalPrice')) $('finalPrice').value = price;
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


  const totals = calculateTotals(filtered);

  if ($("ordersSummary")) {
    $("ordersSummary").innerHTML = `
      ${createCard("Orders", filtered.length)}
      ${createCard("Sales", money(totals.total))}
      ${createCard("Advance", money(totals.advance))}
      ${createCard("Outstanding", money(totals.balance))}
    `;
  }

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

function createOrderRow(order) {
  const balance = order.balance ?? calculateBalance(order.total, order.advance);
  const items = Array.isArray(order.items) && order.items.length ? order.items : [{ product: order.product, qty: order.qty, rate: order.rate, finalPrice: order.finalPrice, total: order.total }];
  const productHTML = items.map(item => `${escapeHTML(item.product || '')}<br><small>Qty: ${escapeHTML(item.qty || 1)}</small>`).join('<hr style="border:0;border-top:1px solid #d8d5cc;margin:4px 0;">');
  const rateHTML = items.map(item => money(item.rate)).join('<br>');
  const finalHTML = items.map(item => `<strong>${money(item.finalPrice)}</strong>`).join('<br>');

  return `
    <tr>
      <td><strong>${escapeHTML(order.orderNo)}</strong></td>
      <td>${escapeHTML(formatDisplayDate(order.date))}</td>
      <td><strong>${escapeHTML(order.customer)}</strong>${order.mobile ? `<br><small>${escapeHTML(order.mobile)}</small>` : ''}</td>
      <td>${productHTML}</td>
      <td>${rateHTML}</td>
      <td>${finalHTML}</td>
      <td><strong>${money(order.total)}</strong></td>
      <td>${money(order.advance)}</td>
      <td>${money(balance)}</td>
      <td><span class="pill">${escapeHTML(order.paymentStatus || '')}</span></td>
      <td><span class="pill">${escapeHTML(order.orderStatus || '')}</span></td>
      <td>
        <button class="action" onclick="openOrder('${escapeHTML(order.id)}')">Edit</button>
        <button class="action danger" onclick="deleteOrder('${escapeHTML(order.id)}')">Delete</button>
      </td>
    </tr>`;
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
   PRINT / SAVE ORDERS PDF
   ========================================================= */

function printOrdersReport() {
  const search = $('search') ? $('search').value.trim().toLowerCase() : '';
  const statusFilter = $('statusFilter') ? $('statusFilter').value : '';
  const paymentFilter = $('paymentFilter') ? $('paymentFilter').value : '';

  const filtered = orders.filter(order => {
    const searchable = [order.orderNo, order.customer, order.mobile, order.product, ...(order.items || []).map(item => item.product)].join(' ').toLowerCase();
    return (!search || searchable.includes(search)) &&
      (!statusFilter || order.orderStatus === statusFilter) &&
      (!paymentFilter || order.paymentStatus === paymentFilter);
  });

  const totals = calculateTotals(filtered);
  const activeOrders = filtered.filter(order => !['Delivered', 'RTO'].includes(order.orderStatus));

  const rows = filtered.map(order => {
    const items = Array.isArray(order.items) && order.items.length ? order.items : [{ product: order.product, qty: order.qty, rate: order.rate, finalPrice: order.finalPrice, total: order.total }];
    const productCell = items.map(item => `<div class="item-line"><strong>${escapeHTML(item.product || '')}</strong> <span class="muted">Qty: ${escapeHTML(item.qty || 1)}</span></div>`).join('');
    const rateCell = items.map(item => `<div class="item-line">${money(item.rate)}</div>`).join('');
    const finalCell = items.map(item => `<div class="item-line"><strong>${money(item.finalPrice)}</strong></div>`).join('');
    const balance = order.balance ?? calculateBalance(order.total, order.advance);
    return `<tr>
      <td>${escapeHTML(order.orderNo)}</td>
      <td>${escapeHTML(formatDisplayDate(order.date))}</td>
      <td><strong>${escapeHTML(order.customer)}</strong>${order.mobile ? `<br><span class="muted">${escapeHTML(order.mobile)}</span>` : ''}</td>
      <td>${productCell}</td>
      <td class="right">${rateCell}</td>
      <td class="right">${finalCell}</td>
      <td class="right"><strong>${money(order.total)}</strong></td>
      <td class="right">${money(order.advance)}</td>
      <td class="right">${money(balance)}</td>
      <td>${escapeHTML(order.paymentStatus || '')}</td>
      <td>${escapeHTML(order.orderStatus || '')}</td>
    </tr>`;
  }).join('');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow pop-ups to print or save the Orders PDF.');
    return;
  }

  printWindow.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>WOGE Order Manager - Orders Report</title>
<style>
@page { size: A4 landscape; margin: 9mm; }
* { box-sizing:border-box; }
html,body { margin:0;padding:0;background:#fff;color:#161616;font-family:Arial,Helvetica,sans-serif;font-size:9px; }
.header { border-bottom:2px solid #c9a227;padding-bottom:8px;margin-bottom:10px; }
.brand { font-size:10px;font-weight:800;letter-spacing:2.2px; }
.title { margin:3px 0 2px;font-family:Georgia,"Times New Roman",serif;font-size:23px;font-weight:800; }
.subtitle { color:#666;font-size:8px; }
.summary { display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:10px 0 11px; }
.summary-card { border:1px solid #d4d0c7;background:#f8f7f3;padding:7px 8px; }
.summary-label { color:#666;font-size:6.5px;font-weight:800;letter-spacing:.8px;text-transform:uppercase; }
.summary-value { margin-top:3px;font-size:12px;font-weight:800; }
table { width:100%;border-collapse:collapse;table-layout:fixed; }
thead { display:table-header-group; }
tr { page-break-inside:avoid; }
th { background:#181818;color:#fff;border:1px solid #181818;padding:5px 4px;text-align:left;font-size:6.5px;font-weight:800;text-transform:uppercase;letter-spacing:.35px; }
td { border:1px solid #d7d7d7;padding:5px 4px;vertical-align:top;font-size:7.5px;line-height:1.25;word-break:break-word; }
tbody tr:nth-child(even) td { background:#f7f7f7; }
.right{text-align:right}.muted{color:#777;font-size:6.5px}.item-line{margin:0 0 2px}.item-line:last-child{margin-bottom:0}
th:nth-child(1){width:8%} th:nth-child(2){width:7%} th:nth-child(3){width:12%} th:nth-child(4){width:14%} th:nth-child(5){width:9%} th:nth-child(6){width:9%} th:nth-child(7){width:9%} th:nth-child(8){width:8%} th:nth-child(9){width:8%} th:nth-child(10){width:8%} th:nth-child(11){width:8%}
.footer { display:flex;justify-content:space-between;gap:20px;margin-top:9px;padding-top:6px;border-top:1px solid #bbb;color:#666;font-size:6.5px; }
@media print { body{-webkit-print-color-adjust:exact;print-color-adjust:exact;} }
</style></head><body>
<div class="header"><div class="brand">WORD OF GOD ENTERPRISES</div><div class="title">WOGE ORDER MANAGER</div><div class="subtitle">Orders Report &nbsp;•&nbsp; ${escapeHTML(formatDisplayDate(today()))}${search || statusFilter || paymentFilter ? ' &nbsp;•&nbsp; Filtered Orders' : ''}</div></div>
<div class="summary">
<div class="summary-card"><div class="summary-label">Orders</div><div class="summary-value">${filtered.length}</div></div>
<div class="summary-card"><div class="summary-label">Sales</div><div class="summary-value">${money(totals.total)}</div></div>
<div class="summary-card"><div class="summary-label">Advance Collected</div><div class="summary-value">${money(totals.advance)}</div></div>
<div class="summary-card"><div class="summary-label">Outstanding</div><div class="summary-value">${money(totals.balance)}</div></div>
<div class="summary-card"><div class="summary-label">Active Orders</div><div class="summary-value">${activeOrders.length}</div></div>
</div>
<table><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Product</th><th>Product Price</th><th>Final Price</th><th>Total</th><th>Advance</th><th>Balance</th><th>Payment</th><th>Status</th></tr></thead>
<tbody>${rows || '<tr><td colspan="11" style="text-align:center;padding:12px;">No orders found.</td></tr>'}</tbody></table>
<div class="footer"><span>WORD OF GOD ENTERPRISES &nbsp;•&nbsp; WOGE ORDER MANAGER</span><span>Generated: ${escapeHTML(new Date().toLocaleString('en-IN'))}</span></div>
</body></html>`);
  printWindow.document.close();
  printWindow.onload = function () { setTimeout(() => printWindow.print(), 450); };
}

/* =========================================================
   PRINT / SAVE DASHBOARD PDF
   ========================================================= */

function printDashboardReport() {

  const todayOrders = orders.filter(order => order.date === today());
  const totals = calculateTotals(todayOrders);
  const activeOrders = orders.filter(
    order => !["Delivered", "RTO"].includes(order.orderStatus)
  );

  const rows = orders.map(order => {
    const qty = Number(order.qty || 1) || 1;
    const finalPrice =
      order.finalPrice !== undefined && order.finalPrice !== null
        ? Number(order.finalPrice || 0)
        : Number(order.total || 0) / qty;

    const balance =
      order.balance !== undefined && order.balance !== null
        ? Number(order.balance || 0)
        : calculateBalance(order.total, order.advance);

    return `
      <tr>
        <td>${escapeHTML(order.orderNo)}</td>
        <td>${escapeHTML(formatDisplayDate(order.date))}</td>
        <td><strong>${escapeHTML(order.customer)}</strong>${order.mobile ? `<br><span class="muted">${escapeHTML(order.mobile)}</span>` : ""}</td>
        <td>${escapeHTML(order.product)}<br><span class="muted">Qty: ${escapeHTML(order.qty)}</span></td>
        <td class="right">${money(order.rate)}</td>
        <td class="right"><strong>${money(finalPrice)}</strong></td>
        <td class="right"><strong>${money(order.total)}</strong></td>
        <td class="right">${money(order.advance)}</td>
        <td class="right">${money(balance)}</td>
        <td>${escapeHTML(order.paymentStatus || "")}</td>
        <td>${escapeHTML(order.orderStatus || "")}</td>
      </tr>`;
  }).join("");

  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    alert("Please allow pop-ups to print or save the dashboard PDF.");
    return;
  }

  printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>WOGE Order Manager - Dashboard Report</title>
<style>
  @page { size: A4 landscape; margin: 9mm; }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #161616;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9px;
  }

  .page {
    width: 100%;
  }

  .header {
    border-bottom: 2px solid #c9a227;
    padding-bottom: 8px;
    margin-bottom: 10px;
  }

  .brand {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 2.2px;
  }

  .title {
    margin: 3px 0 2px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 23px;
    font-weight: 800;
    letter-spacing: -.2px;
  }

  .subtitle {
    color: #666;
    font-size: 8px;
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
    margin: 10px 0 11px;
  }

  .summary-card {
    border: 1px solid #d4d0c7;
    background: #f8f7f3;
    padding: 7px 8px;
  }

  .summary-label {
    color: #666;
    font-size: 6.5px;
    font-weight: 800;
    letter-spacing: .8px;
    text-transform: uppercase;
  }

  .summary-value {
    margin-top: 3px;
    font-size: 12px;
    font-weight: 800;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  thead {
    display: table-header-group;
  }

  tr {
    page-break-inside: avoid;
  }

  th {
    background: #181818;
    color: #fff;
    border: 1px solid #181818;
    padding: 5px 4px;
    text-align: left;
    font-size: 6.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: .35px;
  }

  td {
    border: 1px solid #d7d7d7;
    padding: 5px 4px;
    vertical-align: top;
    font-size: 7.5px;
    line-height: 1.25;
    word-break: break-word;
  }

  tbody tr:nth-child(even) td {
    background: #f7f7f7;
  }

  .right { text-align: right; }
  .muted { color: #777; font-size: 6.5px; }

  th:nth-child(1) { width: 8%; }
  th:nth-child(2) { width: 7%; }
  th:nth-child(3) { width: 12%; }
  th:nth-child(4) { width: 14%; }
  th:nth-child(5) { width: 9%; }
  th:nth-child(6) { width: 9%; }
  th:nth-child(7) { width: 9%; }
  th:nth-child(8) { width: 8%; }
  th:nth-child(9) { width: 8%; }
  th:nth-child(10) { width: 8%; }
  th:nth-child(11) { width: 8%; }

  .footer {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    margin-top: 9px;
    padding-top: 6px;
    border-top: 1px solid #bbb;
    color: #666;
    font-size: 6.5px;
  }

  @media print {
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="brand">WORD OF GOD ENTERPRISES</div>
    <div class="title">WOGE ORDER MANAGER</div>
    <div class="subtitle">Dashboard Report &nbsp;•&nbsp; ${escapeHTML(formatDisplayDate(today()))}</div>
  </div>

  <div class="summary">
    <div class="summary-card">
      <div class="summary-label">Today's Orders</div>
      <div class="summary-value">${todayOrders.length}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Today's Sales</div>
      <div class="summary-value">${money(totals.total)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Advance Collected</div>
      <div class="summary-value">${money(totals.advance)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Outstanding</div>
      <div class="summary-value">${money(totals.balance)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Active Orders</div>
      <div class="summary-value">${activeOrders.length}</div>
    </div>
  </div>

  <table>
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
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="11" style="text-align:center;padding:12px;">No orders found.</td></tr>'}
    </tbody>
  </table>

  <div class="footer">
    <span>WORD OF GOD ENTERPRISES &nbsp;•&nbsp; WOGE ORDER MANAGER</span>
    <span>Generated: ${escapeHTML(new Date().toLocaleString("en-IN"))}</span>
  </div>

</div>
<script>
  window.onload = function () {
    setTimeout(function () { window.print(); }, 450);
  };
<\/script>
</body>
</html>`);

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


  /* Multi-product order items are wired through their inline handlers. */

  if ($("orderItems")) {
    renderOrderItems();
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
   CALENDAR PICKER
   ========================================================= */

function normalizeDateValue(value) {
  const v = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return v;
}

function setupCalendarPickers() {
  ["orderDate", "deliveryDate", "dailyDate", "weekDate", "monthDate"].forEach(id => {
    const input = $(id);
    if (!input || input.dataset.wogeCalendarReady === "1") return;

    input.type = id === "monthDate" ? "month" : "date";
    input.style.cursor = "pointer";
    input.dataset.wogeCalendarReady = "1";

    const openPicker = (event) => {
      // Chrome/Edge expose showPicker() for the native calendar UI.
      // Keep the native control as the fallback for other browsers.
      try {
        if (typeof input.showPicker === "function") {
          event.preventDefault();
          input.showPicker();
        }
      } catch (e) {
        // Browser will use the normal native date control.
      }
    };

    input.addEventListener("click", openPicker);
  });
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

  // Enable the browser's real calendar popup on every date field.
  setupCalendarPickers();

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

window.printOrdersReport =
  printOrdersReport;

window.addOrderItem =
  addOrderItem;

window.removeOrderItem =
  removeOrderItem;

window.orderItemProductChanged =
  orderItemProductChanged;

window.recalculateOrderItems =
  recalculateOrderItems;


/* =========================================================
   GO
   ========================================================= */

boot();
