import request from './request';
import response from './response';

export class Context {
    public readonly request = request;
    public readonly response = response;
}

export default new Context();

