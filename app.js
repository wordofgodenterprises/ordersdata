/* =========================================================
   WOGE ORDER MANAGER
   APPLICATION ENGINE
   ========================================================= */


/* =========================================================
   CONFIGURATION
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


/* =========================================================
   DEFAULT PRODUCTS
   ========================================================= */

const DEFAULT_PRODUCTS = [

  "LED Bible Verse Frame",

  "Premium LED Frame",

  "Customized Church Logo Frame",

  "Large-Size LED Scripture Frame",

  "Multilingual LED Bible Verse Frame",

  "UV Printed Mobile Cover",

  "Church Podium",

  "LED Cross"

];


/* =========================================================
   DATA
   ========================================================= */

let products =
  JSON.parse(
    localStorage.getItem("woge_products")
  ) || DEFAULT_PRODUCTS;


let orders =
  JSON.parse(
    localStorage.getItem("woge_orders")
  ) || [];


/* =========================================================
   HELPERS
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


function generateId() {

  return Date.now().toString(36) +
    Math.random().toString(36).substring(2);

}


function escapeHTML(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


/* =========================================================
   SAVE DATA
   ========================================================= */

function saveData() {

  localStorage.setItem(
    "woge_products",
    JSON.stringify(products)
  );

  localStorage.setItem(
    "woge_orders",
    JSON.stringify(orders)
  );

}


/* =========================================================
   ORDER NUMBER
   ========================================================= */

function generateOrderNumber() {

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
    new Date().getFullYear() +
    "-" +
    String(highest + 1).padStart(4, "0")
  );

}


/* =========================================================
   PAYMENT STATUS AUTOMATION
   =========================================================

   Rules:

   Pay on Delivery
        ↓
   Always Pay on Delivery

   Advance = 0
        ↓
   Unpaid

   Advance > 0 AND Advance < Total
        ↓
   Partially Paid

   Advance >= Total
        ↓
   Paid

   ========================================================= */

function calculatePaymentStatus(
  total,
  advance,
  selectedStatus
) {

  total = Number(total) || 0;

  advance = Number(advance) || 0;


  /* Pay on Delivery */

  if (
    selectedStatus === "Pay on Delivery"
  ) {

    return "Pay on Delivery";

  }


  /* No payment */

  if (advance <= 0) {

    return "Unpaid";

  }


  /* Full payment */

  if (
    total > 0 &&
    advance >= total
  ) {

    return "Paid";

  }


  /* Partial payment */

  return "Partially Paid";

}


/* =========================================================
   BALANCE CALCULATION
   ========================================================= */

function calculateBalance(
  total,
  advance
) {

  total = Number(total) || 0;

  advance = Number(advance) || 0;

  return Math.max(
    0,
    total - advance
  );

}


/* =========================================================
   INITIAL SETUP
   ========================================================= */

function setupApplication() {

  /* Dates */

  if ($("dailyDate")) {

    $("dailyDate").value = today();

  }


  if ($("weekDate")) {

    $("weekDate").value = today();

  }


  if ($("monthDate")) {

    $("monthDate").value =
      currentMonth();

  }


  /* Order status dropdown */

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


  /* Order status filter */

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


  /* Product dropdown */

  populateProductDropdown();


  /* Event listeners */

  setupEvents();


  /* Render */

  renderEverything();

}


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function setupEvents() {


  /* Navigation */

  document
    .querySelectorAll(".tab")
    .forEach(button => {

      button.addEventListener(
        "click",
        function () {

          showPage(
            this.dataset.page
          );

        }
      );

    });


  /* Order form */

  if ($("orderForm")) {

    $("orderForm")
      .addEventListener(
        "submit",
        saveOrder
      );

  }


  /* Payment calculation */

  if ($("total")) {

    $("total")
      .addEventListener(
        "input",
        updatePaymentFields
      );

  }


  if ($("advance")) {

    $("advance")
      .addEventListener(
        "input",
        updatePaymentFields
      );

  }


  if ($("paymentStatus")) {

    $("paymentStatus")
      .addEventListener(
        "change",
        updatePaymentFields
      );

  }


  /* Quantity × Rate */

  if ($("qty")) {

    $("qty")
      .addEventListener(
        "input",
        autoCalculateTotal
      );

  }


  if ($("rate")) {

    $("rate")
      .addEventListener(
        "input",
        autoCalculateTotal
      );

  }

}


/* =========================================================
   PAGE NAVIGATION
   ========================================================= */

function showPage(pageName) {


  document
    .querySelectorAll(".page")
    .forEach(page => {

      page.classList.remove(
        "active"
      );

    });


  document
    .querySelectorAll(".tab")
    .forEach(tab => {

      tab.classList.remove(
        "active"
      );

    });


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
   OPEN NEW ORDER
   ========================================================= */

function openOrder(id = null) {


  if (!$("modal")) {

    return;

  }


  $("modal")
    .classList
    .remove("hidden");


  $("editId").value =
    id || "";


  populateProductDropdown();


  if (id) {

    const order =
      orders.find(
        item => item.id === id
      );


    if (!order) {

      closeModal();

      return;

    }


    $("modalTitle").textContent =
      "Edit Order";


    fillOrderForm(order);


  } else {


    $("modalTitle").textContent =
      "New Order";


    resetOrderForm();


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
   RESET ORDER FORM
   ========================================================= */

function resetOrderForm() {


  $("orderForm").reset();


  $("editId").value = "";


  $("orderNo").value =
    generateOrderNumber();


  $("orderDate").value =
    today();


  $("qty").value = 1;


  $("rate").value = 0;


  $("total").value = 0;


  $("advance").value = 0;


  $("paymentStatus").value =
    "Unpaid";


  $("orderStatus").value =
    "Created";


  $("paymentMethod").value =
    "Cash";


  $("deliveryType").value =
    "Pickup";


  $("deliveryDate").value =
    "";


  $("notes").value =
    "";


  updatePaymentFields();

}


/* =========================================================
   FILL EDIT FORM
   ========================================================= */

function fillOrderForm(order) {


  $("orderNo").value =
    order.orderNo || "";


  $("orderDate").value =
    order.date || today();


  $("customer").value =
    order.customer || "";


  $("mobile").value =
    order.mobile || "";


  $("product").value =
    order.product || "";


  $("qty").value =
    order.qty || 1;


  $("rate").value =
    order.rate || 0;


  $("total").value =
    order.total || 0;


  $("advance").value =
    order.advance || 0;


  $("paymentStatus").value =
    order.paymentStatus ||
    "Unpaid";


  $("orderStatus").value =
    order.orderStatus ||
    "Created";


  $("deliveryDate").value =
    order.deliveryDate || "";


  $("paymentMethod").value =
    order.paymentMethod ||
    "Cash";


  $("deliveryType").value =
    order.deliveryType ||
    "Pickup";


  $("notes").value =
    order.notes || "";

}


/* =========================================================
   AUTO CALCULATE TOTAL
   ========================================================= */

function autoCalculateTotal() {


  const quantity =
    Number(
      $("qty").value
    ) || 0;


  const rate =
    Number(
      $("rate").value
    ) || 0;


  const calculated =
    quantity * rate;


  $("total").value =
    calculated.toFixed(2);


  updatePaymentFields();

}


/* =========================================================
   UPDATE PAYMENT FIELDS
   ========================================================= */

function updatePaymentFields() {


  const total =
    Number(
      $("total").value
    ) || 0;


  const advance =
    Number(
      $("advance").value
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
   SAVE ORDER
   ========================================================= */

function saveOrder(event) {


  event.preventDefault();


  const editId =
    $("editId").value;


  const total =
    Number(
      $("total").value
    ) || 0;


  const advance =
    Number(
      $("advance").value
    ) || 0;


  /* Prevent advance greater than total */

  if (advance > total && total > 0) {

    alert(
      "Advance Paid cannot be greater than Total Amount."
    );

    $("advance").focus();

    return;

  }


  const paymentStatus =
    calculatePaymentStatus(
      total,
      advance,
      $("paymentStatus").value
    );


  const order = {

    id:
      editId ||
      generateId(),

    orderNo:
      $("orderNo").value,

    date:
      $("orderDate").value,

    customer:
      $("customer").value.trim(),

    mobile:
      $("mobile").value.trim(),

    product:
      $("product").value,

    qty:
      Number(
        $("qty").value
      ) || 0,

    rate:
      Number(
        $("rate").value
      ) || 0,

    total:
      total,

    advance:
      advance,

    balance:
      calculateBalance(
        total,
        advance
      ),

    paymentStatus:
      paymentStatus,

    orderStatus:
      $("orderStatus").value,

    deliveryDate:
      $("deliveryDate").value,

    paymentMethod:
      $("paymentMethod").value,

    deliveryType:
      $("deliveryType").value,

    notes:
      $("notes").value.trim(),

    updatedAt:
      new Date().toISOString()

  };


  /* Edit existing order */

  if (editId) {

    orders =
      orders.map(
        existing =>
          existing.id === editId
            ? order
            : existing
      );

  }

  /* New order */

  else {

    orders.unshift(order);

  }


  saveData();


  closeModal();


  renderEverything();


  showPage("orders");


}


/* =========================================================
   DELETE ORDER
   ========================================================= */

function deleteOrder(id) {


  const order =
    orders.find(
      item => item.id === id
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


  orders =
    orders.filter(
      item => item.id !== id
    );


  saveData();


  renderEverything();

}


/* =========================================================
   PRODUCT DROPDOWN
   ========================================================= */

function populateProductDropdown() {


  if (!$("product")) {

    return;

  }


  $("product").innerHTML =
    products
      .map(
        product =>
          `<option value="${escapeHTML(product)}">
            ${escapeHTML(product)}
          </option>`
      )
      .join("");

}


/* =========================================================
   PRODUCT MANAGEMENT
   ========================================================= */

function addProduct() {


  const input =
    $("newProduct");


  if (!input) {

    return;

  }


  const product =
    input.value.trim();


  if (!product) {

    alert(
      "Please enter a product name."
    );

    return;

  }


  const exists =
    products.some(
      item =>
        item.toLowerCase() ===
        product.toLowerCase()
    );


  if (exists) {

    alert(
      "This product already exists."
    );

    return;

  }


  products.push(product);


  saveData();


  input.value = "";


  populateProductDropdown();


  renderProducts();


  alert(
    "Product added successfully."
  );

}


/* =========================================================
   REMOVE PRODUCT
   ========================================================= */

function removeProduct(index) {


  if (
    index < 0 ||
    index >= products.length
  ) {

    return;

  }


  const product =
    products[index];


  const confirmed =
    confirm(
      `Remove "${product}" from the product list?`
    );


  if (!confirmed) {

    return;

  }


  products.splice(
    index,
    1
  );


  saveData();


  populateProductDropdown();


  renderProducts();

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
   DASHBOARD
   ========================================================= */

function renderDashboard() {


  const date =
    today();


  const todayOrders =
    orders.filter(
      order =>
        order.date === date
    );


  const todaySales =
    todayOrders.reduce(
      (sum, order) =>
        sum + Number(order.total || 0),
      0
    );


  const todayAdvance =
    todayOrders.reduce(
      (sum, order) =>
        sum + Number(order.advance || 0),
      0
    );


  const todayOutstanding =
    todayOrders.reduce(
      (sum, order) =>
        sum + Number(order.balance ?? calculateBalance(order.total, order.advance)),
      0
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


  $("dashCards").innerHTML =

    dashboardCard(
      "Today's Orders",
      todayOrders.length
    ) +

    dashboardCard(
      "Today's Sales",
      money(todaySales)
    ) +

    dashboardCard(
      "Advance Collected",
      money(todayAdvance)
    ) +

    dashboardCard(
      "Outstanding",
      money(todayOutstanding)
    ) +

    dashboardCard(
      "Active Orders",
      activeOrders.length
    );


  $("recentOrders").innerHTML =
    createOrdersTable(
      orders.slice(0, 8)
    );

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
    orders.filter(order => {


      const searchable =
        [
          order.orderNo,
          order.customer,
          order.mobile,
          order.product
        ]
          .join(" ")
          .toLowerCase();


      const matchesSearch =
        !search ||
        searchable.includes(
          search
        );


      const matchesStatus =
        !statusFilter ||
        order.orderStatus ===
          statusFilter;


      const matchesPayment =
        !paymentFilter ||
        order.paymentStatus ===
          paymentFilter;


      return (
        matchesSearch &&
        matchesStatus &&
        matchesPayment
      );

    });


  $("ordersTable").innerHTML =
    createOrdersTable(
      filtered
    );

}


/* =========================================================
   DAILY ORDERS
   ========================================================= */

function renderDaily() {


  if (!$("dailyDate")) {

    return;

  }


  const selectedDate =
    $("dailyDate").value ||
    today();


  const dailyOrders =
    orders.filter(
      order =>
        order.date ===
        selectedDate
    );


  $("dailyTable").innerHTML =
    createOrdersTable(
      dailyOrders
    );

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
    start.getDate() + 6
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
   WEEKLY SUMMARY
   ========================================================= */

function renderWeekly() {


  if (!$("weekDate")) {

    return;

  }


  const selected =
    $("weekDate").value ||
    today();


  const range =
    getWeekRange(
      selected
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


  $("weeklyTable").innerHTML =
    createSummaryTable(
      list
    );

}


/* =========================================================
   MONTHLY SUMMARY
   ========================================================= */

function renderMonthly() {


  if (!$("monthDate")) {

    return;

  }


  const selected =
    $("monthDate").value ||
    currentMonth();


  const list =
    orders.filter(
      order =>
        order.date.startsWith(
          selected
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


  $("monthlyTable").innerHTML =
    createSummaryTable(
      list
    );

}


/* =========================================================
   CALCULATE TOTALS
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
   ORDERS TABLE
   ========================================================= */

function createOrdersTable(
  list
) {


  if (!list.length) {

    return `

      <p>
        No orders found.
      </p>

    `;

  }


  return `

    <table class="table">

      <thead>

        <tr>

          <th>Order</th>

          <th>Date</th>

          <th>Customer</th>

          <th>Product</th>

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
            order =>
              createOrderRow(
                order
              )
          )
          .join("")}

      </tbody>

    </table>

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
        ${escapeHTML(order.customer)}
      </td>


      <td>
        ${escapeHTML(order.product)}
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
          ${escapeHTML(order.paymentStatus)}
        </span>

      </td>


      <td>

        <span class="pill">
          ${escapeHTML(order.orderStatus)}
        </span>

      </td>


      <td>

        <button
          class="action"
          onclick="openOrder('${escapeHTML(order.id)}')">

          Edit

        </button>


        <button
          class="action danger"
          onclick="deleteOrder('${escapeHTML(order.id)}')">

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

      <p>
        No orders for this period.
      </p>

    `;

  }


  const daily = {};


  list.forEach(order => {


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

  });


  const dates =
    Object.keys(daily)
      .sort();


  return `

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

  `;

}


/* =========================================================
   PRODUCTS PAGE
   ========================================================= */

function renderProducts() {


  if (!$("productList")) {

    return;

  }


  if (!products.length) {

    $("productList").innerHTML = `

      <p style="
        padding:25px;
        text-align:center;
        color:#777;
      ">
        No products added.
      </p>

    `;

    return;

  }


  $("productList").innerHTML =
    products
      .map(
        (product, index) => `

          <div class="product-row">

            <span>
              ${escapeHTML(product)}
            </span>

            <button
              class="action danger"
              onclick="removeProduct(${index})">

              Remove

            </button>

          </div>

        `
      )
      .join("");

}


/* =========================================================
   KEYBOARD SHORTCUT
   ========================================================= */

document.addEventListener(
  "keydown",
  function(event) {


    /* Escape closes modal */

    if (
      event.key === "Escape"
    ) {

      closeModal();

    }


    /* Ctrl + N opens order */

    if (
      event.ctrlKey &&
      event.key.toLowerCase() === "n"
    ) {

      event.preventDefault();

      openOrder();

    }

  }
);


/* =========================================================
   CLICK OUTSIDE MODAL
   ========================================================= */

document.addEventListener(
  "click",
  function(event) {


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


/* =========================================================
   START APPLICATION
   ========================================================= */

setupApplication();
