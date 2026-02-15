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

module.exports = router;
