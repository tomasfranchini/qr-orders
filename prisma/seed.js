require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // 1) Restaurant
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: "juri-demo" },
    update: {},
    create: {
      name: "Juri Demo",
      slug: "juri-demo",
      phone: null,
      address: null,
    },
  });

  // 2) Tables
  const tables = [
    { number: 1, code: "T1-XYZ" },
    { number: 2, code: "T2-XYZ" },
    { number: 3, code: "T3-XYZ" },
  ];

  for (const t of tables) {
    await prisma.table.upsert({
      where: { code: t.code },
      update: { number: t.number, active: true, restaurantId: restaurant.id },
      create: {
        restaurantId: restaurant.id,
        number: t.number,
        code: t.code,
        active: true,
      },
    });
  }

  // 3) Categories
  const bebidas = await prisma.menuCategory.upsert({
    where: { id: `${restaurant.id}-bebidas` }, // truco para id estable: lo cambiamos abajo
    update: {},
    create: {
      restaurantId: restaurant.id,
      name: "Bebidas",
      orderIndex: 1,
    },
  }).catch(async () => {
    // fallback si no existe ese id (porque Prisma usa cuid):
    return prisma.menuCategory.findFirst({ where: { restaurantId: restaurant.id, name: "Bebidas" } }) ||
      prisma.menuCategory.create({
        data: { restaurantId: restaurant.id, name: "Bebidas", orderIndex: 1 },
      });
  });

  const picadas = await prisma.menuCategory.upsert({
    where: { id: `${restaurant.id}-picadas` },
    update: {},
    create: {
      restaurantId: restaurant.id,
      name: "Picadas",
      orderIndex: 2,
    },
  }).catch(async () => {
    return prisma.menuCategory.findFirst({ where: { restaurantId: restaurant.id, name: "Picadas" } }) ||
      prisma.menuCategory.create({
        data: { restaurantId: restaurant.id, name: "Picadas", orderIndex: 2 },
      });
  });

  // Si quedaron null por el fallback raro, las buscamos bien:
  const bebidasCat =
    (await prisma.menuCategory.findFirst({ where: { restaurantId: restaurant.id, name: "Bebidas" } })) || bebidas;
  const picadasCat =
    (await prisma.menuCategory.findFirst({ where: { restaurantId: restaurant.id, name: "Picadas" } })) || picadas;

  // 4) Items
  const items = [
    {
      name: "Cerveza IPA 473ml",
      price: 3500,
      categoryId: bebidasCat.id,
      description: null,
      imageUrl: null,
    },
    {
      name: "Tabla de quesos",
      price: 7500,
      categoryId: picadasCat.id,
      description: null,
      imageUrl: null,
    },
  ];

  for (const it of items) {
    const existing = await prisma.menuItem.findFirst({
      where: { restaurantId: restaurant.id, name: it.name },
    });

    if (!existing) {
      await prisma.menuItem.create({
        data: {
          restaurantId: restaurant.id,
          categoryId: it.categoryId,
          name: it.name,
          description: it.description,
          price: it.price,
          imageUrl: it.imageUrl,
          active: true,
        },
      });
    }
  }

  console.log("✅ Seed completado");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });