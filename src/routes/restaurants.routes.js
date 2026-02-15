const express = require("express");
const { prisma } = require("../prisma");

const router = express.Router();

router.get("/:slug/menu", async (req, res) => {
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

    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

    return res.json(restaurant);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
