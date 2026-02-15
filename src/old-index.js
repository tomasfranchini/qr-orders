const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());


app.get("/", (req, res) => {
  res.json({ message: "API funcionando 🚀" });
});

app.get("/routes", (req, res) => {
  res.json({
    routes: [
      "GET /",
      "GET /restaurants/:slug/menu",
      "GET /tables/:code/session",
      "POST /orders"
    ],
  });
});

app.get("/restaurants/:slug/menu", async (req, res) => {
  try {
    const { slug } = req.params;

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      include: {
        categories: {
          orderBy: { orderIndex: "asc" },
          include: {
            items: {
              where: { active: true },
              orderBy: { name: "asc" },
            },
          },
        },
      },
    });

    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    return res.json(restaurant);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});



app.get("/tables/:code/session", async (req, res) => {
  try {
    const { code } = req.params;

    const table = await prisma.table.findUnique({
      where: { code },
      include: { restaurant: true },
    });

    if (!table || !table.active) {
      return res.status(404).json({ error: "Table not found or inactive" });
    }

    let session = await prisma.tableSession.findFirst({
      where: { tableId: table.id, status: "OPEN" },
      orderBy: { openedAt: "desc" },
    });

    if (!session) {
      session = await prisma.tableSession.create({
        data: {
          restaurantId: table.restaurantId,
          tableId: table.id,
          status: "OPEN",
        },
      });
    }

    return res.json({
      restaurant: { name: table.restaurant.name, slug: table.restaurant.slug },
      table: { number: table.number, code: table.code },
      session: { id: session.id, status: session.status, openedAt: session.openedAt },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/*POST /orders */

app.post("/orders", async (req, res) => {
  try {
    /**
     * Body esperado:
     * {
     *   "sessionId": "xxx",
     *   "paymentMethod": "CASH" | "WALLET",
     *   "items": [
     *     { "menuItemId": "xxx", "quantity": 2 },
     *     { "menuItemId": "yyy", "quantity": 1 }
     *   ]
     * }
     */
    const { sessionId, paymentMethod, items } = req.body;

    if (!sessionId || !paymentMethod || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Invalid body. sessionId, paymentMethod, items[] required." });
    }

    // Validar cantidades
    for (const it of items) {
      if (!it.menuItemId || typeof it.quantity !== "number" || it.quantity <= 0) {
        return res.status(400).json({ error: "Each item must have menuItemId and quantity > 0." });
      }
    }

    // Buscar sesión y restaurante asociado
    const session = await prisma.tableSession.findUnique({
      where: { id: sessionId },
      include: { table: true, restaurant: true },
    });

    if (!session) return res.status(404).json({ error: "Session not found." });
    if (session.status !== "OPEN") return res.status(400).json({ error: "Session is not OPEN." });

    // Traer los productos desde DB y validar que pertenezcan al restaurante y estén activos
    const menuItemIds = items.map((i) => i.menuItemId);

    const dbItems = await prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        restaurantId: session.restaurantId,
        active: true,
      },
    });

    if (dbItems.length !== menuItemIds.length) {
      return res.status(400).json({
        error: "Some items are invalid/inactive or do not belong to this restaurant.",
      });
    }

    // Map rápido id -> producto
    const map = new Map(dbItems.map((i) => [i.id, i]));

    // Calcular totales + armar snapshots
    let total = 0;
    const orderItemsData = items.map((it) => {
      const product = map.get(it.menuItemId);
      const price = Number(product.price); // Decimal -> number para cálculo
      const subtotal = price * it.quantity;
      total += subtotal;

      return {
        menuItemId: product.id,
        nameSnapshot: product.name,
        priceSnapshot: product.price, // guardamos Decimal tal cual
        quantity: it.quantity,
        subtotal: product.price.mul(it.quantity), // Decimal * int
      };
    });

    // Crear order + items en una transacción
    const created = await prisma.order.create({
      data: {
        restaurantId: session.restaurantId,
        sessionId: session.id,
        orderType: "DINE_IN",
        status: "PENDING",
        paymentMethod,
        totalAmount: total, // Prisma Decimal acepta number también
        items: { create: orderItemsData },
      },
      include: { items: true },
    });

    return res.status(201).json({
      orderId: created.id,
      sessionId: created.sessionId,
      totalAmount: created.totalAmount,
      status: created.status,
      paymentMethod: created.paymentMethod,
      items: created.items,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**Listar pedidos para cocina */

app.get("/kitchen/orders", async (req, res) => {
  try {
    const { restaurantSlug, status } = req.query;

    if (!restaurantSlug) {
      return res.status(400).json({ error: "restaurantSlug is required" });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: restaurantSlug },
    });

    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

    const where = {
      restaurantId: restaurant.id,
      ...(status ? { status } : {}),
    };

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: {
        session: { include: { table: true } },
        items: true,
      },
    });

    return res.json(
      orders.map((o) => ({
        id: o.id,
        createdAt: o.createdAt,
        status: o.status,
        paymentMethod: o.paymentMethod,
        orderType: o.orderType,
        totalAmount: o.totalAmount,
        tableNumber: o.session?.table?.number ?? null,
        itemsCount: o.items.reduce((acc, it) => acc + it.quantity, 0),
        items: o.items.map((it) => ({
          name: it.nameSnapshot,
          quantity: it.quantity,
        })),
      }))
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**Cambiar estado de pedido */
app.patch("/orders/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ["PENDING", "PREPARING", "READY", "COMPLETED", "CANCELLED"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    // 1) Chequear si existe (así evitamos errores raros)
    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Order not found" });
    }

    // 2) Actualizar
    const updated = await prisma.order.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    });

    return res.json(updated);
  } catch (err) {
    // En DEV: devolvemos info útil (sin volarnos la cabeza)
    console.error("PATCH /orders/:id/status failed:", err);

    // Prisma suele traer code en err.code (P2025, etc.)
    return res.status(500).json({
      error: "Internal server error",
      details: err?.message,
      code: err?.code,
    });
  }
});


/**Detalle de pedido */
app.get("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        session: { include: { table: true } },
        items: true,
        restaurant: true,
      },
    });

    if (!order) return res.status(404).json({ error: "Order not found" });

    return res.json({
      id: order.id,
      restaurant: { name: order.restaurant.name, slug: order.restaurant.slug },
      createdAt: order.createdAt,
      status: order.status,
      orderType: order.orderType,
      paymentMethod: order.paymentMethod,
      totalAmount: order.totalAmount,
      tableNumber: order.session?.table?.number ?? null,
      items: order.items.map((it) => ({
        name: it.nameSnapshot,
        price: it.priceSnapshot,
        quantity: it.quantity,
        subtotal: it.subtotal,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});



const PORT = 3001;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

