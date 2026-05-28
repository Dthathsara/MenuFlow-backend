import {
  ExceptionFilter, Catch, ArgumentsHost,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const responseBody =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? exceptionResponse as Record<string, any>
        : {};

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : responseBody.message ?? 'Internal server error';

    const error =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : responseBody.error ??
          (exception instanceof HttpException ? exception.name.replace('Exception', '') : 'Internal Server Error');

    const errorResponse = {
      statusCode: status,
      message,
      error,
    };

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(errorResponse);
  }
}
