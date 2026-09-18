
class ApiResponse {
    
    constructor(statusCode, message, data = {}) {
        this.statusCode = statusCode;
        this.status = 'success';
        this.message = message;
        this.data = data;
    }

    toJSON() {
        return {
            code: this.statusCode,
            status: this.status,
            message: this.message,
            data: this.data,
        };
    }
}

module.exports = { ApiResponse };