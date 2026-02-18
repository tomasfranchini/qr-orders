const express = require("express");
const { prisma } = require("../prisma");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { sessionId, paymentMethod, items } = req.body;

    if (!sessionId || !paymentMethod || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Invalid body" });
    }

    for (const it of items) {
      if (!it.menuItemId || typeof it.quantity !== "number" || it.quantity <= 0) {
        return res.status(400).json({ error: "Each item must have menuItemId and quantity > 0." });
      }
    }

    const session = await prisma.tableSession.findUnique({ where: { id: sessionId } });
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status !== "OPEN") return res.status(400).json({ error: "Session is not OPEN" });

    const menuItemIds = items.map((i) => i.menuItemId);
    const dbItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, restaurantId: session.restaurantId, active: true },
    });

    if (dbItems.length !== menuItemIds.length) {
      return res.status(400).json({ error: "Invalid items" });
    }

    const map = new Map(dbItems.map((i) => [i.id, i]));

    let total = 0;
    const orderItemsData = items.map((it) => {
      const product = map.get(it.menuItemId);
      total += Number(product.price) * it.quantity;

      return {
        menuItemId: product.id,
        nameSnapshot: product.name,
        priceSnapshot: product.price,
        quantity: it.quantity,
        subtotal: product.price.mul(it.quantity),
      };
    });

    const created = await prisma.order.create({
      data: {
        restaurantId: session.restaurantId,
        sessionId: session.id,
        orderType: "DINE_IN",
        status: "PENDING",
        paymentMethod,
        totalAmount: total,
        items: { create: orderItemsData },
      },
      include: { items: true },
    });

    return res.status(201).json(created);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: { session: { include: { table: true } }, items: true, restaurant: true },
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

router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status: nextStatus } = req.body;

    const allowed = ["PENDING", "PREPARING", "READY", "COMPLETED", "CANCELLED"];
    if (!allowed.includes(nextStatus)) return res.status(400).json({ error: "Invalid status" });

    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!order) return res.status(404).json({ error: "Order not found" });

    const transitions = {
      PENDING: ["PREPARING", "CANCELLED"],
      PREPARING: ["READY", "CANCELLED"],
      READY: ["COMPLETED"],
      COMPLETED: [],
      CANCELLED: [],
    };

    const canGo = transitions[order.status]?.includes(nextStatus);
    if (!canGo) {
      return res.status(400).json({
        error: "Invalid transition",
        from: order.status,
        to: nextStatus,
        allowedNext: transitions[order.status] || [],
      });
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status: nextStatus },
      select: { id: true, status: true },
    });

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


module.exports = router;
