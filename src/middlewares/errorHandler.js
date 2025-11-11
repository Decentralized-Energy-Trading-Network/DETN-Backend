const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || "Something went wrong";
    let errorDetails = err.details || err.stack;

    res.status(statusCode).json({
        status: "error",
        message,
        error: {
            code: statusCode,
            details: errorDetails
        }
    });
};

module.exports = errorHandler;
