import {
  CloudFormationClient,
  DescribeStacksCommand,
  DescribeStacksCommandInput,
} from "@aws-sdk/client-cloudformation";
import {
  CloudFrontRequestCallback,
  CloudFrontRequestEvent,
  Context,
} from "aws-lambda";

type RequestCookies = {
  key?: string | undefined;
  value: string;
}[];

const allowedProjectPrefixes = new RegExp(
  "^((\\w{1,5})-(\\d{1,5})(-(\\w+))*|dependabot(-((\\w|\\W\\d)+))+)",
  ""
);
const FEATURE_BRANCH_IDENTIFIER = "featbr";
const client = new CloudFormationClient({ region: "eu-west-1" });
//if cookie contains SLF_MFE_BRANCH_NAME return its value
const getCookieValue = (cookies: RequestCookies) => {
  console.debug("Req cookies-", cookies);
  if (!cookies) {
    return null;
  }

  const cookieValue = cookies[0].value.split(";");
  const branchNameCookie = cookieValue.find((cookie) => {
    return cookie.includes(FEATURE_BRANCH_IDENTIFIER);
  });

  if (!branchNameCookie) {
    return null;
  }

  return branchNameCookie.split("=")[1];
};

//if query string contains SLF_MFE_BRANCH_NAME return its value
const getQuerystringValue = (querystring: string) => {
  console.debug("getQuerystringValue query string: ", querystring);
  if (querystring.includes(FEATURE_BRANCH_IDENTIFIER)) {
    const branchName = querystring.split("=")[1];
    console.debug("Found branch name in query string: ", branchName);
    return branchName;
  }
  return null;
};

//Make sure branch name follows regex pattern
// const isValidFeatureBranch = (branchName: string) => {
//   if (!allowedProjectPrefixes.test(branchName)) {
//     console.error("handleRouting -> Invalid Feature Branch name", {
//       branchName,
//     });
//     throw Error(`handleRouting -> Invalid Feature Branch name: ${branchName}`);
//   }
//   return true;
// };

export const handler = async (
  event: CloudFrontRequestEvent,
  context: Context,
  callback: CloudFrontRequestCallback
) => {
  const request = event.Records[0].cf.request;
  const { headers, querystring } = request;
  const requestCookies = headers.cookie;
  const branchName = getQuerystringValue(querystring);

  if (branchName) {
    console.debug("Feature Branch Request detected: ", {
      branchName,
      pathname: request.uri,
    });
    // Set featbr header
    headers["featbr"] = [{ key: "featbr", value: branchName }];
    // const input: DescribeStacksCommandInput = { StackName: branchName };
    // const command = new DescribeStacksCommand(input);
    // const response = await client.send(command);

    // if (!response.Stacks) {
    //   console.error("No stacks found");
    //   return callback(null, request);
    // }

    // console.debug("Found Stack!");
    // //Get Function Url form cloudformation outputs
    // const functionUrl = response.Stacks[0].Outputs?.find(
    //   (o) => o.OutputKey === "FunctionUrl"
    // )?.OutputValue;

    // if (!functionUrl) {
    //   console.error("No function url found in stack: ", branchName);
    //   return callback(null, request);
    // }
    const url = new URL(
      "https://lw5hzidhqwap375kz5ch4w73ta0xzmhk.lambda-url.eu-west-1.on.aws"
    );
    const redirectResponse = {
      status: "301",
      statusDescription: "Moved Permanently",
      headers: {
        location: [
          {
            key: "Location",
            value:
              "https://lw5hzidhqwap375kz5ch4w73ta0xzmhk.lambda-url.eu-west-1.on.aws/",
          },
        ],
        "cache-control": [
          {
            key: "Cache-Control",
            value: "max-age=3600",
          },
        ],
      },
    };
    console.debug("change redirectResponse");
    // request.uri =
    //   "https://lw5hzidhqwap375kz5ch4w73ta0xzmhk.lambda-url.eu-west-1.on.aws";
    // request.headers["host"] = [{ key: "host", value: url.host }];
    callback(null, redirectResponse);
  }

  console.debug("REQUEST HEADERS", headers);

  callback(null, request);
};
