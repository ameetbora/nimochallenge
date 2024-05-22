import https from 'https';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  GetCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const client = new DynamoDBClient({});

const dynamo = DynamoDBDocumentClient.from(client);

const sesClient = new SESClient({});

const tableName = "crypto-search-table";

const cryptoSearchPath = "/getCryptoPrice";
const searchHistoryPath = "/getSearchHistory";

const generateUniqueId = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

const fetchCryptoData = (cryptoName) => {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'GET',
            hostname: 'api.coingecko.com',
            port: null,
            path: '/api/v3/simple/price?ids=${cryptoName}&vs_currencies=aud',
            headers: {
              accept: 'application/json',
              'x-cg-demo-api-key': 'CG-x4S17cfGjJEyjEDAL5MyzUmw'
            }
          };

        const req = https.request(options, res => {
            let data = '';

            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                resolve(JSON.parse(data));
            });
        });

        req.on('error', error => {
            reject(error);
        });

        req.end();
    });
};

const sendEmail = async (data, cryptoName, email) => {
    const params = {
      Destination: {
        ToAddresses: [email], // Change to your recipient email address
      },
      Message: {
        Body: {
          Text: { Data: `The current price of ${cryptoName} in AUD is ${data[cryptoName].aud}` },
        },
        Subject: { Data: "Crypto Data Saved Successfully" },
      },
      Source: 'ameetbora1989@gmail.com', // Change to your verified sender email address
    };
  
    try {
      const result = await sesClient.send(new SendEmailCommand(params));
      console.log("Email sent successfully:", result);
    } catch (error) {
      console.error("Error sending email:", error);
    }
  };

export const handler = async (event, context) => {
    let body;
    let statusCode = 200;
    const headers = {
      "Content-Type": "application/json",
    };

    const queryParams = event.queryStringParameters;
    const cryptoName = queryParams && queryParams.cryptoName ? queryParams.cryptoName : 'bitcoin';
    const email = queryParams && queryParams.email ? queryParams.email : 'ameetbora1989@gmail.com';

    try{
        switch (true) {
            
            case event.httpMethod === "GET" && event.path === searchHistoryPath:
              body = await dynamo.send(
                new ScanCommand({ TableName: tableName })
              );
              body = body.Items;
              break;
            case event.httpMethod === "GET" && event.path === cryptoSearchPath:
                const data = await fetchCryptoData(cryptoName);
                //console.log('Fetched data:', data);
                //body = JSON.stringify('Hello from Lambda!' + data.bitcoin);
                const uniqueId = generateUniqueId();
                    const putParams = {
                        TableName: tableName,
                        Item: {
                            id: uniqueId,
                            Crypto_Name: cryptoName,
                            Price: data[cryptoName].aud,
                            Timestamp: Math.floor(Date.now() / 1000)
                        }
                    };

                await dynamo.send(new PutCommand(putParams));
                await sendEmail(data, cryptoName, email);
                body = {
                  message: 'Data stored successfully',
                  data: data[cryptoName]
                };
                break;
            default:
              throw new Error(`Unsupported route: "${event.path}"`);
          }
    } catch (err) {
        statusCode = 400;
        body = err.message;
      } finally {
        body = JSON.stringify(body);
    }
    return {
        statusCode,
        body,
        headers,
      };
}  