import serverless from "serverless-http";
import { createExpressApp } from "../server";

let serverlessHandler: any;

export const handler = async (event: any, context: any) => {
  if (!serverlessHandler) {
    const app = await createExpressApp();
    serverlessHandler = serverless(app);
  }
  return serverlessHandler(event, context);
};
