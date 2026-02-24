const express = require("express");
const { prisma } = require("../prisma");

const router = express.Router();

// Cerrar sesión (cuenta)
router.patch("/:id/close", async (req, res) => {
  try {
    const { id } = req.params;

    const session = await prisma.tableSession.findUnique({
      where: { id },
      include: {
        table: true,
        restaurant: true,
        orders: { include: { items: true } },
      },
    });

    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status !== "OPEN") {
      return res.status(400).json({ error: `Session is not OPEN (current: ${session.status})` });
    }

    // Si hay pedidos READY, se permite cerrar pero se envía una advertencia
    const blockingOrders = session.orders.filter((o) =>
  ["PENDING", "PREPARING"].includes(o.status)
)

if (blockingOrders.length > 0) {
  return res.status(400).json({
    error: "Cannot close session: there are orders still in progress",
    blockingOrders: blockingOrders.map((o) => ({ id: o.id, status: o.status })),
  });
}

// forzar cierre incluso con pedidos activos (opcional, según reglas de negocio)
router.patch("/:id/force-close", async (req, res) => {
  try {
    const { id } = req.params;

    const session = await prisma.tableSession.findUnique({
      where: { id },
      include: {
        table: true,
        restaurant: true,
        orders: true, // no hace falta items para force close
      },
    });

    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status !== "OPEN") {
      return res.status(400).json({ error: `Session is not OPEN (current: ${session.status})` });
    }

    const activeOrders = session.orders.filter((o) =>
      ["PENDING", "PREPARING", "READY"].includes(o.status)
    );

    const updated = await prisma.tableSession.update({
      where: { id },
      data: { status: "CLOSED", closedAt: new Date() },
      select: { id: true, status: true, openedAt: true, closedAt: true },
    });

    return res.json({
      warning: activeOrders.length
        ? "Session was force-closed with active orders"
        : "Session force-closed (no active orders)",
      session: updated,
      restaurant: { name: session.restaurant.name, slug: session.restaurant.slug },
      table: { number: session.table.number, code: session.table.code },
      activeOrders: activeOrders.map((o) => ({ id: o.id, status: o.status })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

    // Total = suma de subtotales de items de todas las órdenes NO canceladas
    const total = session.orders
      .filter((o) => o.status !== "CANCELLED")
      .reduce((acc, o) => {
        const orderTotal = o.items.reduce((sum, it) => sum + Number(it.subtotal), 0);
        return acc + orderTotal;
      }, 0);

    const updated = await prisma.tableSession.update({
      where: { id },
      data: { status: "CLOSED", closedAt: new Date() },
      select: { id: true, status: true, openedAt: true, closedAt: true },
    });

    return res.json({
      session: updated,
      restaurant: { name: session.restaurant.name, slug: session.restaurant.slug },
      table: { number: session.table.number, code: session.table.code },
      totalAmount: total,
      ordersCount: session.orders.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Resumen de sesión (para caja)
router.get("/:id/summary", async (req, res) => {
  try {
    const { id } = req.params;

    const session = await prisma.tableSession.findUnique({
      where: { id },
      include: {
        table: true,
        restaurant: true,
        orders: { include: { items: true } },
      },
    });

    if (!session) return res.status(404).json({ error: "Session not found" });

    const total = session.orders
      .filter((o) => o.status !== "CANCELLED")
      .reduce((acc, o) => acc + o.items.reduce((sum, it) => sum + Number(it.subtotal), 0), 0);

    return res.json({
      session: { id: session.id, status: session.status, openedAt: session.openedAt, closedAt: session.closedAt },
      restaurant: { name: session.restaurant.name, slug: session.restaurant.slug },
      table: { number: session.table.number, code: session.table.code },
      orders: session.orders.map((o) => ({
        id: o.id,
        status: o.status,
        totalAmount: o.totalAmount,
        items: o.items.map((it) => ({ name: it.nameSnapshot, qty: it.quantity, subtotal: it.subtotal })),
      })),
      totalAmount: total,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;

cmlubm9qz0001ujt4ym9080jq
Invoke-RestMethod -Method Patch -Uri "http://localhost:3001/sessions/cmlubm9qz0001ujt4ym9080jq/force-close"