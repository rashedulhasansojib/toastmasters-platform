import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';

/**
 * Renders every error as RFC 7807 application/problem+json. Typed against
 * minimal request/response shapes so this file carries no framework-specific
 * import beyond @nestjs/common.
 */
interface ResponseLike {
  status(code: number): ResponseLike;
  type(contentType: string): ResponseLike;
  json(body: unknown): void;
}
interface RequestLike {
  url: string;
}

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [extension: string]: unknown;
}

@Catch()
export class ProblemJsonFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<ResponseLike>();
    const request = http.getRequest<RequestLike>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const problem: ProblemDetails = {
      type: 'about:blank',
      title: exception instanceof HttpException ? exception.message : 'Internal Server Error',
      status,
      instance: request.url,
    };

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (body && typeof body === 'object') {
        Object.assign(problem, body);
        problem.status = status;
      } else if (typeof body === 'string') {
        problem.detail = body;
      }
    }

    response.status(status).type('application/problem+json').json(problem);
  }
}
