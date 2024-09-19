const { ObjectId } = require('mongodb'); // Import ObjectId
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');  // For JWT authentication
const MongoClient = require('mongodb').MongoClient;

const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = 'Programmer@102';  // Secret for signing JWT

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// MongoDB setup
const uri = "mongodb+srv://kapilpandey103:Programmer%40102@giftdeliverycluster.se2p8.mongodb.net/?retryWrites=true&w=majority&appName=GiftDeliveryCluster";
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

let userCollection;
let orderCollection;

// Connect to MongoDB
async function connectToDB() {
    try {
        await client.connect();
        userCollection = client.db("giftdelivery").collection("users");
        orderCollection = client.db("giftdelivery").collection("orders");
        console.log('Database connected and collections ready.');
    } catch (err) {
        console.error("Failed to connect to MongoDB:", err);
    }
}

connectToDB();

/**
 * Middleware to verify JWT token
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Token required' });
    }

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Token invalid or expired' });
        }
        req.user = user;  // Attach user info to request object
        next();
    });
};


app.get('/', (req, res) => {
    res.send('Welcome to the Gift Delivery API');
});

// ===================== USER SIGNUP =====================
app.post('/register', async (req, res) => {
    const { email, password, firstName, lastName, phoneNumber, address, postcode, state } = req.body;

    try {
        const existingUser = await userCollection.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { email, password: hashedPassword, firstName, lastName, phoneNumber, address, postcode, state };

        await userCollection.insertOne(newUser);

        const registrationTime = new Date().toLocaleString();
        console.log(`
            ================== REGISTRATION SUCCESS ==================
            User: ${firstName} ${lastName}
            Email: ${email}
            Registered at: ${registrationTime}
            ===========================================================
        `);
        console.log("User registered successfully:", email);  // Log registration success
        res.status(201).json({ success: true, message: "User registered successfully" });
    } catch (error) {
        console.error("Error during user registration:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// ===================== USER LOGIN =====================
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
        return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    try {
        const user = await userCollection.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid email or password" });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(400).json({ success: false, message: "Invalid email or password" });
        }

        // Create a JWT token for the user
        const token = jwt.sign({ email: user.email, userId: user._id }, jwtSecret, { expiresIn: '1h' });
        // Log the successful login
        const loginTime = new Date().toLocaleString();
        console.log(`
        ================== LOGIN SUCCESS ==================
        User: ${user.firstName} ${user.lastName}
        Email: ${user.email}
        Login Time: ${loginTime}
        ====================================================
`);
        res.status(200).json({ success: true, token, user });
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});


// ===================== POST ORDER =====================
app.post('/postOrderData', authenticateToken, async (req, res) => {
    const orderInfo = req.body;
    const userEmail = req.user.email;

    try {
        // Add user email to the order info
        orderInfo.customerEmail = userEmail;
        orderInfo.orderNo = Math.trunc(Math.random() * 900000 + 100000);  // Generate random order number

        await orderCollection.insertOne(orderInfo);
        console.log(`[ORDER] Order placed successfully for ${userEmail}: Order No ${orderInfo.orderNo}`);
        res.status(200).json({ success: true, message: "Order placed successfully", orderNo: orderInfo.orderNo });
    } catch (error) {
        console.error(`[ORDER] Error placing order for ${userEmail}:`, error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// Route to get the user's orders
app.post('/getUserOrders', authenticateToken, async (req, res) => {
    const userEmail = req.user.email;

    try {
        const orders = await orderCollection.find({ customerEmail: userEmail }).toArray();
        res.status(200).json(orders);
    } catch (error) {
        console.error(`[ORDER] Error fetching orders for ${userEmail}:`, error);
        res.status(500).json({ message: "Error fetching orders" });
    }
});

// DELETE orders by IDs
app.delete('/deleteUserOrders', authenticateToken, async (req, res) => {
    try {
        const { orderIds } = req.body;

        // Validate if the orderIds array exists and has valid entries
        if (!Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).send({ message: "No orders selected for deletion." });
        }

        // Attempt to convert each orderId to an ObjectId, handle invalid ones
        const objectIds = orderIds.map(id => {
            if (ObjectId.isValid(id)) {
                return ObjectId(id); // Convert valid string to ObjectId
            } else {
                throw new Error(`Invalid ObjectId format: ${id}`);
            }
        });

        const userEmail = req.user.email;  // Get email from the JWT token

        console.log(`Deleting orders for user: ${userEmail}, Order IDs: ${objectIds}`);

        // Delete the orders that match both _id and customerEmail
        const result = await orderCollection.deleteMany({
            _id: { $in: objectIds },
            customerEmail: userEmail
        });

        if (result.deletedCount > 0) {
            console.log(`[ORDER] Orders deleted for ${userEmail}: Deleted Count ${result.deletedCount}`);
            res.status(200).send({ message: `${result.deletedCount} orders deleted successfully`, deletedCount: result.deletedCount });
        } else {
            console.log(`[ORDER] No orders deleted for ${userEmail}`);
            res.status(400).send({ message: "No matching orders found for deletion" });
        }
    } catch (error) {
        console.error(`[ORDER] Error deleting orders for ${req.user.email}:`, error);
        res.status(500).send({ message: "Failed to delete orders", error: error.message });
    }
});
// GET endpoint to fetch user data for testing
app.get('/getUserDataTest', async (req, res) => {
    try {
        // Query the MongoDB 'users' collection to get all users (or modify the query to fit your needs)
        const users = await userCollection.find({}).toArray();

        // Log the users to verify
        console.log('Users fetched:', users);

        // Send the result back to the client
        res.status(200).json(users);
    } catch (error) {
        console.error("Error fetching user data:", error);
        res.status(500).json({ message: "Error fetching user data" });
    }
});

// GET endpoint to fetch order data for testing
app.get('/getOrderDataTest', async (req, res) => {
    try {
        // Query the MongoDB 'orders' collection to get all orders (or filter if needed)
        const orders = await orderCollection.find({}).toArray();

        // Log the fetched orders for debugging purposes
        console.log('Orders fetched:', orders);

        // Send the order data back to the client
        res.status(200).json(orders);
    } catch (error) {
        console.error("Error fetching order data:", error);
        res.status(500).json({ message: "Error fetching order data" });
    }
});

// DELETE endpoint to delete selected orders
app.delete('/deleteUserOrders', authenticateToken, async (req, res) => {
    try {
        const { orderIds } = req.body;

        // Validate if the orderIds array exists and has valid entries
        if (!Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).send({ message: "No orders selected for deletion." });
        }

        // Attempt to convert each orderId to an ObjectId, handle invalid ones
        const objectIds = orderIds.map(id => {
            if (ObjectId.isValid(id)) {
                return new ObjectId(id); // Convert valid string to ObjectId
            } else {
                throw new Error(`Invalid ObjectId format: ${id}`);
            }
        });

        const userEmail = req.user.email;  // Get email from the JWT token

        console.log(`Deleting orders for user: ${userEmail}, Order IDs: ${objectIds}`);

        // Delete the orders that match both _id and customerEmail
        const result = await orderCollection.deleteMany({
            _id: { $in: objectIds },
            customerEmail: userEmail
        });

        if (result.deletedCount > 0) {
            console.log(`[ORDER] Orders deleted for ${userEmail}: Deleted Count ${result.deletedCount}`);
            res.status(200).send({ message: `${result.deletedCount} orders deleted successfully`, deletedCount: result.deletedCount });
        } else {
            console.log(`[ORDER] No orders deleted for ${userEmail}`);
            res.status(400).send({ message: "No matching orders found for deletion" });
        }
    } catch (error) {
        console.error(`[ORDER] Error deleting orders for ${req.user.email}:`, error);
        res.status(500).send({ message: "Failed to delete orders", error: error.message });
    }
});
// ===============================================================
// ------------------- Express Server Setup ----------------------
// ===============================================================
app.listen(port, () => {
    console.log(`Gift Delivery server app listening at http://localhost:${port}`);
});
