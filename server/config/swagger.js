import swaggerJSDoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Vector API',
      version: '1.0.0',
      description: 'Документация REST API комплекса управления проектами (Vector)',
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Локальный сервер разработки',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./routes/*.js'], // Читать комментарии из всех роутеров
};

export const swaggerSpec = swaggerJSDoc(options);