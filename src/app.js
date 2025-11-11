const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const http = require('http');
const connectDB = require('./config/db');
const userRoutes = require("./routes/userRoutes");
const energyRoutes = require("./routes/energyRoutes");
const fileUploadRoutes = require("./routes/fileUploadRoutes");
const errorHandler = require('./middlewares/errorHandler');
const responseMiddleware = require("./middlewares/responseMiddleware");
const clientRoutes = require('./routes/clientRoutes');
const orderRoutes = require('./routes/orderRoutes');

dotenv.config();
connectDB();



const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(responseMiddleware);
app.use(errorHandler);
app.get("/", (req, res) => res.send("Express on Vercel"));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use((err, req, res, next) => {
    if (err && err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                success: false, 
                message: 'File too large. Maximum size is 5MB' 
            });
        }
        return res.status(400).json({ 
            success: false, 
            message: err.message 
        });
    }
    next(err);
});

app.use("/api/user", userRoutes);
app.use("/api/file", fileUploadRoutes);
app.use("/api/energy", energyRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/orders', orderRoutes);





module.exports = { app, server };