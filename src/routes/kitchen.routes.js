const express = require("express");
const { prisma } = require("../prisma");

const router = express.Router();

router.get("/orders", async (req, res) => {
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
        items: o.items.map((it) => ({ name: it.nameSnapshot, quantity: it.quantity })),
      }))
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
