const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
require("dotenv").config();

const app = express();

/* ================== MIDDLEWARE ================== */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
}));
app.use(express.json());

/* ================== DB CONNECT ================== */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ DB Error:", err));

/* ================== MULTER SETUP ================== */
const upload = multer({ dest: "uploads/" });

/* ================== MODEL ================== */
const itemSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true },
    category:     { type: String, default: "General" },
    quantity:     { type: Number, default: 1 },
    expiry_date:  { type: Date, required: true },
    price:        { type: Number, default: 0 },
    image:        { type: String, default: "" },
    pexelsImage:  { type: String, default: "" },
  },
  { timestamps: true }
);

const Item = mongoose.model("Item", itemSchema);

/* ================== SMART PRICE MAP ================== */
const PRICE_MAP = {
  // Dairy
  "full cream milk":      58,
  "toned milk":           52,
  "paneer":               89,
  "butter":               55,
  "curd 400g":            45,
  "cheese slices":       120,
  "ghee 500ml":          310,
  "cream":                75,
  "lassi":                40,
  "buttermilk":           25,

  // Fruits
  "banana":               35,
  "apple":               150,
  "mango":               120,
  "grapes":               90,
  "papaya":               50,
  "watermelon":           40,
  "orange":               80,
  "pomegranate":         130,
  "pineapple":            70,
  "strawberry":          160,

  // Vegetables
  "tomato":               30,
  "onion":                25,
  "potato":               28,
  "spinach":              20,
  "carrot":               35,
  "capsicum":             45,
  "brinjal":              22,
  "beans":                40,
  "cucumber":             25,
  "cabbage":              30,

  // Bakery
  "white bread":          35,
  "brown bread":          45,
  "butter croissant":     30,
  "cake slice":           55,
  "bun pack":             30,
  "cookies 200g":         60,
  "rusk":                 40,
  "naan":                 25,

  // Grains
  "basmati rice 1kg":    120,
  "wheat flour 1kg":      55,
  "toor dal":            140,
  "moong dal":           130,
  "chana dal":           110,
  "poha 500g":            50,
  "semolina 500g":        40,
  "oats 500g":            90,

  // Beverages
  "mango juice 1l":      110,
  "orange juice 1l":     100,
  "soft drink 2l":        95,
  "green tea 100g":      150,
  "coffee powder 100g":  180,
  "coconut water 500ml":  60,
  "energy drink 250ml":  115,
  "lemon squash 750ml":  130,

  // Snacks
  "chocolate bar":        50,
  "potato chips 100g":    30,
  "biscuits 200g":        40,
  "popcorn 150g":         60,
  "namkeen mix 200g":     45,
  "wafers 100g":          20,
  "peanuts 200g":         35,
  "granola bar":          55,

  // Meat
  "chicken breast 500g": 180,
  "mutton 500g":         380,
  "fish fillet 400g":    220,
  "eggs 12pcs":           90,
  "sausages 250g":       120,
  "prawns 250g":         250,

  // Oils
  "sunflower oil 1l":    155,
  "olive oil 500ml":     480,
  "coconut oil 500ml":   195,
  "mustard oil 1l":      175,
  "groundnut oil 1l":    200,
  "rice bran oil 1l":    160,

  // Frozen
  "frozen peas 500g":     65,
  "frozen corn 500g":     70,
  "ice cream 500ml":     150,
  "frozen pizza":        280,
  "frozen fries 500g":   120,
  "frozen paratha 5pcs":  85,

  // Condiments
  "tomato ketchup 500g":  95,
  "soy sauce 200ml":      65,
  "vinegar 500ml":        55,
  "chilli sauce 300ml":   75,
  "mayonnaise 250g":     110,
  "pickle 500g":          80,

  // General
  "salt 1kg":             20,
  "sugar 1kg":            45,
  "turmeric powder 100g": 35,
  "red chilli powder 100g": 55,
};

function getSmartPrice(name) {
  return PRICE_MAP[name.toLowerCase().trim()] || 0;
}

/* ================== PEXELS IMAGE FETCH ================== */
async function fetchPexelsImage(query) {
  try {
    const cleanQuery = query.replace(/[0-9]/g, "").trim();
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(
      cleanQuery + " food"
    )}&per_page=1&orientation=landscape`;

    const res = await fetch(url, {
      headers: { Authorization: process.env.PEXELS_API_KEY },
    });

    const data = await res.json();

    if (data.photos && data.photos.length > 0) {
      return data.photos[0].src.medium;
    }

    return "";
  } catch (err) {
    console.log("Pexels fetch error:", err.message);
    return "";
  }
}

/* ================== HELPERS ================== */
function getCategoryPlaceholder(category) {
  const placeholders = {
    Bakery:     "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400",
    Dairy:      "https://images.unsplash.com/photo-1550586678-f7225f03c44b?w=400",
    Fruits:     "https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=400",
    Vegetables: "https://images.unsplash.com/photo-1566385101042-1a000c1267c4?w=400",
    Meat:       "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=400",
    General:    "https://images.unsplash.com/photo-1542838132-92c53300491e?w=400",
  };
  return placeholders[category] || placeholders.General;
}

function getStatus(expiryDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const exp = new Date(expiryDate);
  exp.setHours(0, 0, 0, 0);

  if (exp < today) return "Expired";

  const diff = (exp - today) / (1000 * 60 * 60 * 24);

  if (diff === 0) return "Today";
  if (diff <= 1)  return "Critical";
  if (diff <= 3)  return "High";
  if (diff <= 7)  return "Medium";
  if (diff <= 15) return "Low";

  return "Safe";
}

function getDiscount(expiryDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const exp = new Date(expiryDate);
  exp.setHours(0, 0, 0, 0);

  const diff = (exp - today) / (1000 * 60 * 60 * 24);

  if (diff <= 1) return 50;
  if (diff <= 3) return 30;
  if (diff <= 7) return 15;

  return 0;
}

function getDiscountedPrice(price, discount) {
  if (!price || price === 0) return 0;
  return parseFloat((price - (price * discount) / 100).toFixed(2));
}

/* ================== ROUTES ================== */
app.get("/", (req, res) => res.send("🚀 GroceryOS Backend Running"));

/* ================== LOGIN ================== */
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  // ✅ Replace these with your real credentials or a DB lookup
  if (username === "admin" && password === "admin123") {
    return res.json({ token: "groceryos-secret-token-2024" });
  }

  return res.status(401).json({ error: "Invalid credentials" });
});

/* ================== ADD ITEM ================== */
app.post("/items", async (req, res) => {
  try {
    const { name, category, quantity, expiry_date, image } = req.body;

    if (!name || !expiry_date) {
      return res.status(400).json({ error: "name and expiry_date are required" });
    }

    const pexelsImage = await fetchPexelsImage(name);

    const item = new Item({
      name,
      category:    category || "General",
      quantity:    quantity || 1,
      expiry_date: new Date(expiry_date),
      price:       getSmartPrice(name),
      image:       image || "",
      pexelsImage,
    });

    await item.save();
    res.json({ message: "Item added successfully ✅", item });
  } catch (err) {
    console.log("ADD ITEM ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================== UPDATE ITEM ================== */
app.put("/items/:id", async (req, res) => {
  try {
    const { name, category, quantity, expiry_date, image } = req.body;

    if (!name || !expiry_date) {
      return res.status(400).json({ error: "name and expiry_date are required" });
    }

    const updated = await Item.findByIdAndUpdate(
      req.params.id,
      {
        name,
        category,
        quantity,
        expiry_date,
        price: getSmartPrice(name),
        image,
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: "Item not found" });

    res.json({ message: "Item updated ✅", item: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================== DELETE ITEM ================== */
app.delete("/items/:id", async (req, res) => {
  try {
    const deleted = await Item.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Item not found" });
    res.json({ message: "Item deleted ✅" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================== IMPORT EXCEL ================== */
app.post("/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    // ✅ Filter out bad rows before processing
    const validRows = data.filter((row) => row.name && row.expiry_date);

    if (validRows.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "No valid rows found in Excel" });
    }

    const items = (
      await Promise.all(
        validRows.map(async (row) => {
          try {
            const pexelsImage = await fetchPexelsImage(row.name);
            return {
              name:        row.name,
              category:    row.category || "General",
              quantity:    row.quantity || 1,
              expiry_date: new Date(row.expiry_date),
              price:       getSmartPrice(row.name),
              image:       row.image || "",
              pexelsImage,
            };
          } catch {
            return null; // skip failed rows
          }
        })
      )
    ).filter(Boolean);

    await Item.insertMany(items);

    // ✅ Delete uploaded file after processing
    fs.unlinkSync(req.file.path);

    res.json({
      message: `Excel Imported Successfully ✅`,
      count: items.length,
    });
  } catch (err) {
    console.log("IMPORT ERROR:", err);

    // ✅ Clean up file even on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ error: err.message });
  }
});

/* ================== GET ITEMS ================== */
app.get("/items", async (req, res) => {
  try {
    const items = await Item.find().sort({ expiry_date: 1 });

    const data = await Promise.all(
      items.map(async (item) => {
        const status   = getStatus(item.expiry_date);
        const discount = getDiscount(item.expiry_date);

        let pexelsImage = item.pexelsImage;

        if (!pexelsImage) {
          pexelsImage = await fetchPexelsImage(item.name);
          if (pexelsImage) {
            await Item.findByIdAndUpdate(item._id, { pexelsImage });
          }
        }

        const displayImage =
          item.image ||
          pexelsImage ||
          getCategoryPlaceholder(item.category);

        const discountedPrice = getDiscountedPrice(item.price, discount);

        return {
          ...item._doc,
          status,
          discount,
          displayImage,
          discountedPrice,
        };
      })
    );

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================== NEAR EXPIRY ================== */
app.get("/near-expiry", async (req, res) => {
  try {
    const items = await Item.find().sort({ expiry_date: 1 });

    const result = items
      .map((item) => {
        const status   = getStatus(item.expiry_date);
        const discount = getDiscount(item.expiry_date);
        return {
          ...item._doc,
          status,
          discount,
          discountedPrice: getDiscountedPrice(item.price, discount),
        };
      })
      .filter((item) =>
        ["Critical", "High", "Medium"].includes(item.status)
      );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================== ALERTS ================== */
app.get("/alerts", async (req, res) => {
  try {
    const items = await Item.find();

    const alerts = items
      .map((item) => {
        const status   = getStatus(item.expiry_date);
        const discount = getDiscount(item.expiry_date);
        return {
          ...item._doc,
          status,
          discount,
          discountedPrice: getDiscountedPrice(item.price, discount),
        };
      })
      .filter((item) =>
        ["Expired", "Critical", "High"].includes(item.status)
      );

    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================== START SERVER ================== */
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Server running on port ${PORT}`)
);