const responseMiddleware = (req, res, next) => {
    res.sendResponse = (statusCode, status, message, data = null, error = null) => {
        res.status(statusCode).json({
            status,
            message,
            ...(data && { data }),
            ...(error && { error })
        });
    };
    next();
};

module.exports = responseMiddleware;
