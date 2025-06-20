// const { app, BrowserWindow, ipcMain } = require('electron');
// const path = require('path');
// const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

// function createWindow() {
//   const win = new BrowserWindow({
//     width: 800,
//     height: 600,
//     webPreferences: {
//       preload: path.join(__dirname, 'preload.js'),
//     },
//   });
//   win.loadFile('index.html');
// }

// app.whenReady().then(createWindow);

// ipcMain.handle('list-objects', async (_, { accessPointArn, region, accessKey, secretKey }) => {
//   try {
//     const region = "us-east-1"; // Replace with your region
//     const ACCESS_POINT_ARN = "arn:aws:s3:us-east-1:234991748504:accesspoint/amg00000"; // Replace with your ARN
//     const PREFIX = "inbox/amg00000/"; // The folder prefix you are allowed to access

//     const s3 = new S3Client({
//       region,
//       credentials: {
//         accessKeyId: accessKey,
//         secretAccessKey: secretKey,
//       },
//     });

//     const command = new ListObjectsV2Command({
//       Bucket: ACCESS_POINT_ARN,
//       Prefix: PREFIX,
      
//     });

//     const result = await s3.send(command);
//     return JSON.stringify(result.Contents || [], null, 2);
//   } catch (err) {
//     return `Error: ${err.message}`;
//   }
// });

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { S3Client, ListObjectsV2Command, PutObjectCommand } = require('@aws-sdk/client-s3');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false
    },
    titleBarStyle: 'default',
    icon: path.join(__dirname, 'favicon.png') // Use favicon.png as app icon
  });
  
  win.loadFile('index.html');
  
  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// S3 File listing handler
ipcMain.handle('list-objects', async (_, { bucketArn, accessKey, secretKey, prefix }) => {
  try {
    // Validate required parameters
    if (!bucketArn || !accessKey || !secretKey) {
      throw new Error('Missing required S3 credentials');
    }

    // Default to us-east-1 region
    const region = 'us-east-1';

    const s3 = new S3Client({
      region: region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });

    const command = new ListObjectsV2Command({
      Bucket: bucketArn,
      Prefix: prefix || '',
      Delimiter: '/' // This enables folder-like listing
    });

    const result = await s3.send(command);
    
    // Format the response for easier frontend consumption
    const response = {
      folders: result.CommonPrefixes?.map(p => p.Prefix) || [],
      files: result.Contents?.filter(obj => 
        obj.Key !== prefix && // Exclude the folder itself
        !obj.Key.endsWith('/') // Exclude folder markers
      ).map(obj => obj.Key) || []
    };

    return JSON.stringify(response, null, 2);
  } catch (err) {
    console.error('S3 Error:', err);
    throw new Error(`S3 Error: ${err.message}`);
  }
});

// File upload handler
ipcMain.handle('upload-files', async (_, { bucketArn, accessKey, secretKey, prefix, files }) => {
  try {
    // Validate required parameters
    if (!bucketArn || !accessKey || !secretKey || !files || files.length === 0) {
      throw new Error('Missing required parameters for upload');
    }

    // Default to us-east-1 region
    const region = 'us-east-1';

    const s3 = new S3Client({
      region: region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });

    const uploadResults = [];
    const totalFiles = files.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      try {
        // Read file content
        const fileContent = fs.readFileSync(file.path);
        
        // Construct S3 key (prefix + filename)
        const s3Key = prefix + file.name;
        
        // Send progress update
        const progressEvent = {
          type: 'progress',
          currentFile: i + 1,
          totalFiles: totalFiles,
          fileName: file.name,
          fileProgress: 0
        };
        
        // Get main window to send progress updates
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow) {
          mainWindow.webContents.send('upload-progress', progressEvent);
        }

        // Create upload command
        const command = new PutObjectCommand({
          Bucket: bucketArn,
          Key: s3Key,
          Body: fileContent,
          ContentType: file.type || 'application/octet-stream'
        });

        // Upload file
        const result = await s3.send(command);
        
        // Send completion for this file
        const completeEvent = {
          type: 'progress',
          currentFile: i + 1,
          totalFiles: totalFiles,
          fileName: file.name,
          fileProgress: 100
        };
        
        if (mainWindow) {
          mainWindow.webContents.send('upload-progress', completeEvent);
        }

        uploadResults.push({
          fileName: file.name,
          success: true,
          key: s3Key,
          etag: result.ETag
        });

      } catch (fileError) {
        console.error(`Error uploading ${file.name}:`, fileError);
        uploadResults.push({
          fileName: file.name,
          success: false,
          error: fileError.message
        });
      }
    }

    return {
      success: true,
      results: uploadResults,
      totalFiles: totalFiles,
      successCount: uploadResults.filter(r => r.success).length,
      errorCount: uploadResults.filter(r => !r.success).length
    };

  } catch (err) {
    console.error('Upload Error:', err);
    throw new Error(`Upload Error: ${err.message}`);
  }
});






