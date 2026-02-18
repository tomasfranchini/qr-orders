const express = require("express");
const cors = require("cors");

const restaurantsRoutes = require("./routes/restaurants.routes");
const tablesRoutes = require("./routes/tables.routes");
const ordersRoutes = require("./routes/orders.routes");
const kitchenRoutes = require("./routes/kitchen.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.json({ message: "API funcionando 🚀" }));

app.use("/restaurants", restaurantsRoutes);
app.use("/tables", tablesRoutes);
app.use("/orders", ordersRoutes);
app.use("/kitchen", kitchenRoutes);

module.exports = { app };


