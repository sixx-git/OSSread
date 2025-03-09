const express = require('express');
const cors = require('cors');
const OSS = require('ali-oss');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const app = express();
app.use(cors());
app.use(express.json());

// 提供静态文件
app.use(express.static(__dirname));

// 添加请求日志中间件
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// 阿里云OSS配置
const config = {
    accessKeyId: 'LTAI5tQbMoinNqwPE8271nFA',
    accessKeySecret: 'zC6HSkIH37XxyG2cBrQdM7hG5xZ66r',
    bucket: 'njupt1000',
    region: 'oss-cn-nanjing'
};

// 创建OSS客户端
const client = new OSS(config);

// 根路径处理
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 获取文件列表 - 完全在服务器端处理
app.get('/list', async (req, res) => {
    try {
        const prefix = req.query.prefix || '';
        const delimiter = '/';
        
        console.log(`获取文件列表，前缀: ${prefix}`);
        
        // 在服务器端执行OSS操作
        const result = await client.list({
            prefix: prefix,
            delimiter: delimiter,
            "max-keys": 1000
        });
        
        console.log('OSS返回结果:', JSON.stringify(result, null, 2));
        
        // 处理文件和文件夹
        const files = [];
        const folders = [];
        
        // 处理文件夹
        if (result.prefixes) {
            result.prefixes.forEach(prefixItem => {
                const folderName = prefixItem.replace(prefix, '').replace('/', '');
                folders.push({
                    name: folderName,
                    fullPath: prefixItem,
                    isFolder: true
                });
            });
        }
        
        // 处理文件
        if (result.objects) {
            result.objects.forEach(obj => {
                // 跳过当前目录的标记
                if (obj.name === prefix) return;
                
                const fileName = obj.name.replace(prefix, '');
                if (!fileName) return; // 跳过空文件名
                
                // 使用服务器端代理URL
                const viewUrl = `/view?objectName=${encodeURIComponent(obj.name)}`;
                const downloadUrl = `/download?objectName=${encodeURIComponent(obj.name)}`;
                
                files.push({
                    name: fileName,
                    fullPath: obj.name,
                    size: obj.size,
                    lastModified: obj.lastModified,
                    viewUrl: viewUrl,
                    downloadUrl: downloadUrl,
                    isFolder: false
                });
            });
        }
        
        res.json({
            files: files,
            folders: folders,
            prefix: prefix
        });
    } catch (err) {
        console.error('获取文件列表失败:', err);
        console.error('错误详情:', JSON.stringify(err, null, 2));
        res.status(500).json({ error: err.message });
    }
});

// 查看文件
app.get('/view', async (req, res) => {
    try {
        const { objectName } = req.query;
        
        if (!objectName) {
            return res.status(400).json({ error: '缺少objectName参数' });
        }
        
        console.log(`查看文件，对象名: ${objectName}`);
        
        // 获取文件
        const result = await client.get(objectName);
        
        // 设置响应头
        res.set('Content-Type', result.res.headers['content-type']);
        res.set('Content-Length', result.res.headers['content-length']);
        
        // 发送响应
        res.send(result.content);
    } catch (err) {
        console.error('查看文件失败:', err);
        res.status(500).json({ error: err.message });
    }
});

// 下载文件
app.get('/download', async (req, res) => {
    try {
        const { objectName } = req.query;
        
        if (!objectName) {
            return res.status(400).json({ error: '缺少objectName参数' });
        }
        
        console.log(`下载文件，对象名: ${objectName}`);
        
        // 获取文件
        const result = await client.get(objectName);
        
        // 设置响应头
        res.set('Content-Type', 'application/octet-stream');
        res.set('Content-Disposition', `attachment; filename=${encodeURIComponent(path.basename(objectName))}`);
        res.set('Content-Length', result.res.headers['content-length']);
        
        // 发送响应
        res.send(result.content);
    } catch (err) {
        console.error('下载文件失败:', err);
        res.status(500).json({ error: err.message });
    }
});

// 上传文件
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '没有上传文件' });
        }
        
        const { prefix } = req.body;
        const objectName = prefix ? `${prefix}${req.file.originalname}` : req.file.originalname;
        
        console.log(`上传文件，对象名: ${objectName}`);
        
        // 读取上传的文件
        const fileContent = fs.readFileSync(req.file.path);
        
        // 上传到OSS
        const result = await client.put(objectName, fileContent, {
            mime: req.file.mimetype
        });
        
        // 删除临时文件
        fs.unlinkSync(req.file.path);
        
        res.json({
            success: true,
            message: '文件上传成功',
            url: result.url
        });
    } catch (err) {
        console.error('上传文件失败:', err);
        res.status(500).json({ error: err.message });
    }
});

// 删除文件
app.delete('/delete', async (req, res) => {
    try {
        const { objectName } = req.query;
        
        if (!objectName) {
            return res.status(400).json({ error: '缺少objectName参数' });
        }
        
        console.log(`删除文件，对象名: ${objectName}`);
        
        // 删除文件
        await client.delete(objectName);
        
        res.json({ success: true, message: '文件删除成功' });
    } catch (err) {
        console.error('删除文件失败:', err);
        res.status(500).json({ error: err.message });
    }
});

// 创建文件夹
app.post('/create-folder', async (req, res) => {
    try {
        const { folderName, prefix } = req.body;
        
        if (!folderName) {
            return res.status(400).json({ error: '缺少folderName参数' });
        }
        
        const fullPath = prefix ? `${prefix}${folderName}/` : `${folderName}/`;
        
        console.log(`创建文件夹，路径: ${fullPath}`);
        
        // 在OSS中创建一个空对象作为文件夹标记
        await client.put(fullPath, Buffer.from(''));
        
        res.json({ success: true, message: '文件夹创建成功' });
    } catch (err) {
        console.error('创建文件夹失败:', err);
        res.status(500).json({ error: err.message });
    }
});

// 添加测试路由
app.get('/test', (req, res) => {
    res.send('测试服务器正在运行');
});

// 危险行为监控页面
app.get('/danger-monitor', (req, res) => {
    res.sendFile(path.join(__dirname, 'danger-monitor.html'));
});

// 获取危险行为记录列表
app.get('/danger-records', async (req, res) => {
    try {
        // 获取data目录下的所有路段文件夹
        const result = await client.list({
            prefix: 'data/',
            delimiter: '/'
        });
        
        console.log('获取危险行为记录列表');
        
        const records = [];
        
        // 处理每个路段文件夹
        if (result.prefixes && result.prefixes.length > 0) {
            for (const prefix of result.prefixes) {
                try {
                    // 获取路段名称
                    const segmentName = prefix.replace('data/', '').replace('/', '');
                    console.log(`处理路段: ${segmentName}, 前缀: ${prefix}`);
                    
                    // 获取该路段下的所有文件
                    const segmentFiles = await client.list({
                        prefix: prefix
                    });
                    
                    // 检查是否有texts文件夹
                    const textsPrefix = `${prefix}texts/`;
                    const textsResult = await client.list({
                        prefix: textsPrefix
                    });
                    
                    // 为每种危险行为类型收集图片
                    let dangerTypeImages = {
                        '危险左转': [],
                        'A类逆行': [],
                        'B类逆行': [],
                        '在机动车道骑行': [],
                        '快速骑行者靠近': []
                    };
                    
                    // 查找图片文件并按类型分类
                    if (segmentFiles.objects) {
                        segmentFiles.objects.forEach(obj => {
                            if (obj.name === prefix) return; // 跳过目录标记
                            if (obj.name.includes('/texts/')) return; // 跳过texts文件夹中的文件
                            
                            const fileName = obj.name.split('/').pop();
                            if (fileName.endsWith('.jpg') || fileName.endsWith('.png') || fileName.endsWith('.jpeg')) {
                                console.log(`找到图片文件: ${fileName}`);
                                
                                // 根据文件名分类图片
                                if (fileName.includes('危险左转') || fileName.includes('Unsafe Left Turn')) {
                                    dangerTypeImages['危险左转'].push({
                                        url: `/view?objectName=${encodeURIComponent(obj.name)}`,
                                        name: fileName
                                    });
                                }
                                if (fileName.includes('A类逆行')) {
                                    dangerTypeImages['A类逆行'].push({
                                        url: `/view?objectName=${encodeURIComponent(obj.name)}`,
                                        name: fileName
                                    });
                                }
                                if (fileName.includes('B类逆行')) {
                                    dangerTypeImages['B类逆行'].push({
                                        url: `/view?objectName=${encodeURIComponent(obj.name)}`,
                                        name: fileName
                                    });
                                }
                                if (fileName.includes('在机动车道骑行')) {
                                    dangerTypeImages['在机动车道骑行'].push({
                                        url: `/view?objectName=${encodeURIComponent(obj.name)}`,
                                        name: fileName
                                    });
                                }
                                if (fileName.includes('快速骑行者靠近')) {
                                    dangerTypeImages['快速骑行者靠近'].push({
                                        url: `/view?objectName=${encodeURIComponent(obj.name)}`,
                                        name: fileName
                                    });
                                }
                            }
                        });
                    }
                    
                    // 处理文本文件，获取额外的危险行为类型
                    let textDangerTypes = new Set();
                    if (textsResult.objects && textsResult.objects.length > 0) {
                        textsResult.objects.forEach(obj => {
                            if (obj.name === textsPrefix) return; // 跳过目录标记
                            
                            const fileName = obj.name.split('/').pop();
                            console.log(`处理文本文件: ${fileName}`);
                            
                            // 从文本文件名中提取危险行为类型
                            const parts = fileName.split('_');
                            if (parts.length >= 2) {
                                const type = parts[1].split('.')[0]; // 移除文件扩展名
                                textDangerTypes.add(type);
                                console.log(`危险类型: ${type}`);
                                
                                // 如果这是一个新的危险类型，为它创建一个空数组
                                if (!dangerTypeImages[type]) {
                                    dangerTypeImages[type] = [];
                                }
                            }
                        });
                    }
                    
                    // 获取所有有图片的危险类型
                    const dangerTypes = Object.keys(dangerTypeImages).filter(type => dangerTypeImages[type].length > 0);
                    
                    // 时间范围 - 暂时留空
                    let timeRange = '';
                    
                    // 添加记录
                    records.push({
                        segmentName,
                        timeRange: timeRange,
                        dangerTypes: dangerTypes,
                        dangerTypeImages: dangerTypeImages,
                        textFiles: textsResult.objects ? textsResult.objects.map(obj => ({
                            name: obj.name.split('/').pop(),
                            url: `/view?objectName=${encodeURIComponent(obj.name)}`
                        })).filter(file => file.name !== '') : []
                    });
                    console.log(`添加记录: ${segmentName}, 危险类型: ${dangerTypes.join(', ')}`);
                    
                } catch (err) {
                    console.error(`处理路段 ${prefix} 时出错:`, err);
                }
            }
        } else {
            console.log('没有找到任何路段文件夹');
        }
        
        console.log(`总共找到 ${records.length} 条记录`);
        res.json({ records });
    } catch (err) {
        console.error('获取危险行为记录失败:', err);
        res.status(500).json({ error: err.message });
    }
});

// 启动服务器
const PORT = process.env.PORT || 3006;
app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
}); 