const express = require("express");
const { prisma } = require("../prisma");

const router = express.Router();

router.get("/:code/session", async (req, res) => {
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
      restaurant: table.restaurant.name,
      table: table.number,
      sessionId: session.id,
      status: session.status,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:code/bill", async (req, res) => {
  try {
    const { code } = req.params;

    const table = await prisma.table.findUnique({
      where: { code },
      include: { restaurant: true },
    });

    if (!table || !table.active) {
      return res.status(404).json({ error: "Table not found or inactive" });
    }

    const session = await prisma.tableSession.findFirst({
      where: { tableId: table.id, status: "OPEN" },
      orderBy: { openedAt: "desc" },
      include: { orders: { include: { items: true } } },
    });

    if (!session) {
      return res.json({
        table: { number: table.number, code: table.code },
        restaurant: { name: table.restaurant.name, slug: table.restaurant.slug },
        session: null,
        totalAmount: 0,
        orders: [],
      });
    }

    const total = session.orders
      .filter((o) => o.status !== "CANCELLED")
      .reduce((acc, o) => acc + o.items.reduce((sum, it) => sum + Number(it.subtotal), 0), 0);

    return res.json({
      table: { number: table.number, code: table.code },
      restaurant: { name: table.restaurant.name, slug: table.restaurant.slug },
      session: { id: session.id, status: session.status, openedAt: session.openedAt },
      totalAmount: total,
      orders: session.orders.map((o) => ({
        id: o.id,
        status: o.status,
        createdAt: o.createdAt,
        items: o.items.map((it) => ({
          name: it.nameSnapshot,
          qty: it.quantity,
          subtotal: it.subtotal,
        })),
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
module.exports = router;
