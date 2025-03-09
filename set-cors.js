const OSS = require('ali-oss');

// 阿里云OSS配置
const config = {
    accessKeyId: 'LTAI5tQbMoinNqwPE8271nFA',
    accessKeySecret: 'zC6HSkIH37XxyG2cBr0dM7hG5xZ66r',
    bucket: 'njupt1000',
    region: 'oss-cn-nanjing'
};

async function setCORS() {
    try {
        // 创建OSS客户端
        const client = new OSS(config);
        
        // 设置CORS规则
        const result = await client.put 