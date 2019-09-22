import * as http from 'http';
import * as Stream from 'stream';
import * as EventEmitter from 'events';
import statuses from './statutses';
import context, { Context } from './context';
import request from './request';
import response from './response';

interface CTX extends Context {
    res: http.ServerResponse;
    req: http.IncomingMessage;
    app: Koa;
    onerror?: Function;
    respond?: boolean;
    body: any;
    status: number;
    type: string;
    length: number;
    writable: boolean;
    message: any;
    method: string;
}

export default class Koa extends EventEmitter  {
    public context: Context;
    public request: Object;
    public response: Object;
    public middleware: Array<any>;
    public env: string;
    constructor() {
        super();
        this.middleware = [];
        this.env = process.env.NODE_ENV || 'development';
        this.context = Object.create(context);
        this.request = Object.create(request);
        this.response = Object.create(response);
    }

    // 组合中间件
    private compose = (middleware: Array<any>): (ctx: CTX) => Promise<any> => {
        return (ctx: CTX) => {
            return Promise.resolve();
        };
    };

    // 错误处理函数
    private onerror = (err: any) => {
        if (404 == err.status || err.expose) return;

        const msg = err.stack || err.toString();
        console.error();
        console.error(msg.replace(/^/gm, '  '));
        console.error();
    };

    // 初始化Koa上下文
    public createContext = (req: http.IncomingMessage, res: http.ServerResponse): CTX => {
        const ctx = Object.create(this.context);
        const request = Object.create(this.request);
        const response = Object.create(this.response);
        ctx.app = request.app = response.app = this;
        ctx.req = request.req = response.req = req;
        ctx.res = request.res = response.res = res;
        request.ctx = response.ctx = ctx;
        request.response = response;
        response.request = request;
        // cookie
        // url
        // ip
        // accept
        // state
        return ctx;
    };

    // 判断是否为JSON
    public isJSON = (body: any): boolean => {
        return true;
    };
 
    // 响应
    private respond = (ctx: CTX) => {
        // allow bypassing koa
        if (false === ctx.respond) return;

        const res = ctx.res;
        if (!ctx.writable) return;

        let body = ctx.body;
        const code = ctx.status;

        // ignore body
        if (statuses.empty[code]) {
            // strip headers
            ctx.body = null;
            return res.end();
        }

        if ('HEAD' == ctx.method) {
            if (!res.headersSent && this.isJSON(body)) {
                ctx.length = Buffer.byteLength(JSON.stringify(body));
            }
            return res.end();
        }

        // status body
        if (null == body) {
            body = ctx.message || String(code);
            if (!res.headersSent) {
                ctx.type = 'text';
                ctx.length = Buffer.byteLength(body);
            }
            return res.end(body);
        }

        // responses
        if (Buffer.isBuffer(body)) return res.end(body);
        if ('string' == typeof body) return res.end(body);
        if (body instanceof Stream) return body.pipe(res);

        // body: json
        body = JSON.stringify(body);
        if (!res.headersSent) {
            ctx.length = Buffer.byteLength(body);
        }
        res.end(body);
    };

    // 请求处理
    private handleRequest = (ctx: CTX, fnMiddleware: (ctx: Context) => Promise<any>): Promise<any> => {
        // 引用http模块响应方法
        const res = ctx.res;
        // 设置默认http状态码
        res.statusCode = 404;
        // 创建错误处理方法
        const onerror = (err: any) => ctx.onerror(err);
        // 创建请求响应方法
        const onrespond = this.respond;
        // on finish (TODO)
        return fnMiddleware(ctx).then(onrespond).catch(onerror);

    };

    // 创建请求处理回调函数
    private callback = (): http.RequestListener => {
        // 添加错误处理函数
        if (!this.listenerCount('error')) this.on('error', this.onerror);
        // 组合中间件
        const fnc = this.compose(this.middleware);
        // 服务处理回调 
        const handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
            // 创建Koa上下文
            const ctx = this.createContext(req, res);
            return this.handleRequest(ctx, fnc);
        };
        return handler;
    };

    // 监听端口（服务启动）
    public listen = (...args: Array<any>) => {
        const server = http.createServer(this.callback());
        return server.listen(...args);
    };
}