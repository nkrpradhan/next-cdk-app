import {
  CloudFormationClient,
  DescribeStacksCommand,
  DescribeStacksCommandInput,
} from "@aws-sdk/client-cloudformation";
import {
  CloudFrontHeaders,
  CloudFrontRequestCallback,
  CloudFrontRequestEvent,
  CloudFrontResultResponse,
  Context,
} from "aws-lambda";

//Optimisation for warm lambdas is defining clients outside handler
//So they get place in persistant memory and can be reused lowering invocation time
const client = new CloudFormationClient({ region: "eu-west-1" });
const FEATURE_BRANCH_IDENTIFIER_HEADER = "x-slf-mfe-branch-name";
const FEATURE_BRANCH_IDENTIFIER = "featbr";
//if header contains x-slf-mfe-branch-name retrun its value
const getBranchFromHeaders = (headers: CloudFrontHeaders) => {
  if (headers[FEATURE_BRANCH_IDENTIFIER_HEADER]) {
    const branchName = headers[FEATURE_BRANCH_IDENTIFIER_HEADER][0].value;
    console.debug("Found branch name in headers: ", branchName);
    return branchName;
  }
  return null;
};
const getQuerystringValue = (querystring: string) => {
  console.debug(
    "origin request getQuerystringValue query string: ",
    querystring
  );
  if (querystring.includes(FEATURE_BRANCH_IDENTIFIER)) {
    const branchName = querystring.split("=")[1];
    console.debug(
      "origin request-- Found branch name in query string: ",
      branchName
    );
    return branchName;
  }
  return null;
};
export const handler = async (
  event: CloudFrontRequestEvent,
  context: Context,
  callback: CloudFrontRequestCallback
) => {
  const { request } = event.Records[0].cf;
  const { headers, querystring } = request;
  console.debug("origin requestfn querystring", querystring);
  const requestCookies = headers.cookie;
  const branchName = getQuerystringValue(querystring);
  const requestHeaders = request.headers;

  if (!branchName) {
    console.debug("No branch name found in headers");
    return callback(null, request);
  }

  try {
    console.debug("Feature Branch Request detected: ", branchName);
    //Then query cloudformation to find the stack and its outputs
    const input: DescribeStacksCommandInput = { StackName: branchName };
    const command = new DescribeStacksCommand(input);
    const response = await client.send(command);

    if (!response.Stacks) {
      console.error("No stacks found");
      return callback(null, request);
    }

    console.debug("Found Stack!");
    //Get Function Url form cloudformation outputs
    const functionUrl = response.Stacks[0].Outputs?.find(
      (o) => o.OutputKey === "FunctionUrl"
    )?.OutputValue;

    if (!functionUrl) {
      console.error("No function url found in stack: ", branchName);
      return callback(null, request);
    }
    const url = new URL(functionUrl);

    request.headers["host"] = [{ key: "host", value: url.host }];
    request.origin!.custom!.domainName = url.host;

    return callback(null, request);
  } catch (error) {
    console.error("Error: ", error);
    return callback(null, request);
  }
};
