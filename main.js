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
const { spawn } = require('child_process');
const { S3Client, ListObjectsV2Command, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

function findCliRecursive(startDir, targetNames, depth = 0) {
  if (!fs.existsSync(startDir) || depth > 6) {
    return null;
  }

  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && targetNames.includes(entry.name)) {
      return path.join(startDir, entry.name);
    }
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const result = findCliRecursive(path.join(startDir, entry.name), targetNames, depth + 1);
      if (result) {
        return result;
      }
    }
  }
  return null;
}

function resolveBundledCli(platform) {
  if (platform == 'darwin') {
    platform = 'macos'
  }
  const targets = platform === 'win32' ? ['aws.exe'] : ['aws', 'aws2'];
  const bases = [];
  if (process.resourcesPath) {
    bases.push(path.join(process.resourcesPath, 'aws-cli', platform));
  }
  bases.push(path.join(__dirname, 'aws-cli', platform));

  for (const base of bases) {
    const directCandidates = [
      path.join(base, 'bin', targets[0]),
      path.join(base, targets[0]),
      path.join(base, 'v2', 'current', 'bin', targets[0]),
      path.join(base, 'bin', targets[1]),
      path.join(base, targets[1]),
      path.join(base, 'v2', 'current', 'bin', targets[1])
    ];

    for (const candidate of directCandidates) {
      if (fs.existsSync(candidate)) {
        try {
          fs.chmodSync(candidate, 0o755);
        } catch (err) {
          // ignore
        }
        return candidate;
      }
    }

    const recursive = findCliRecursive(base, targets);
    if (recursive) {
      try {
        fs.chmodSync(recursive, 0o755);
      } catch (err) {
        // ignore
      }
      return recursive;
    }
  }
  return null;
}

function getAwsCliExecutable() {
  const envPath = process.env.AWS_CLI_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const bundled = resolveBundledCli(process.platform);
  if (bundled) {
    return bundled;
  }

  const fallback = process.platform === 'win32' ? 'aws.exe' : 'aws';
  console.warn('AWS CLI executable not found in bundle. Falling back to system path:', fallback);
  return fallback;
}

function formatS3Uri(bucketArn, key) {
  const normalizedKey = key.replace(/^\/+/, '');
  return `s3://${bucketArn}/${normalizedKey}`;
}

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
                // Construct S3 key (prefix + filename)
                const s3Key = prefix + file.name;

                // Get main window to send progress updates
                const mainWindow = BrowserWindow.getAllWindows()[0];

                // Emit an initial 0% progress event
                if (mainWindow) {
                    mainWindow.webContents.send('upload-progress', {
                        type: 'progress',
                        currentFile: i + 1,
                        totalFiles: totalFiles,
                        fileName: file.name,
                        fileProgress: 0
                    });
                }

                // Use a read stream for efficient uploads and progress
                const fileStream = fs.createReadStream(file.path);
                const totalBytes = typeof file.size === 'number' && file.size > 0
                    ? file.size
                    : fs.statSync(file.path).size;

                const uploader = new Upload({
                    client: s3,
                    params: {
                        Bucket: bucketArn,
                        Key: s3Key,
                        Body: fileStream,
                        ContentType: file.type || 'application/octet-stream'
                    },
                    queueSize: 4,
                    partSize: 5 * 1024 * 1024,
                    leavePartsOnError: false
                });

                let lastPercent = -1;
                uploader.on('httpUploadProgress', (progress) => {
                    const loaded = progress?.loaded || 0;
                    const percent = totalBytes ? Math.floor((loaded / totalBytes) * 100) : 0;
                    if (percent !== lastPercent && mainWindow) {
                        lastPercent = percent;
                        mainWindow.webContents.send('upload-progress', {
                            type: 'progress',
                            currentFile: i + 1,
                            totalFiles: totalFiles,
                            fileName: file.name,
                            fileProgress: percent
                        });
                    }
                });

                const result = await uploader.done();

                // Ensure a 100% event is emitted at completion
                if (mainWindow && lastPercent !== 100) {
                    mainWindow.webContents.send('upload-progress', {
                        type: 'progress',
                        currentFile: i + 1,
                        totalFiles: totalFiles,
                        fileName: file.name,
                        fileProgress: 100
                    });
                }

                uploadResults.push({
                    fileName: file.name,
                    success: true,
                    key: s3Key,
                    etag: result?.ETag || result?.ETag?.[0] || undefined
                });

            } catch (fileError) {
                console.error(`Error uploading ${file.name}:`, fileError);
                if (mainWindow) {
                    mainWindow.webContents.send('upload-progress', {
                        type: 'error',
                        currentFile: i + 1,
                        totalFiles: totalFiles,
                        fileName: file.name,
                        message: fileError.message || 'Upload failed'
                    });
                }
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

ipcMain.handle('upload-files-cli', async (_, { bucketArn, accessKey, secretKey, prefix, files }) => {
    try {
        if (!bucketArn || !accessKey || !secretKey || !files || files.length === 0) {
            throw new Error('Missing required parameters for CLI upload');
        }

        const cliPath = getAwsCliExecutable();
        const region = 'us-east-1';
        const credentials = {
            accessKeyId: accessKey,
            secretAccessKey: secretKey
        };
        const mainWindow = BrowserWindow.getAllWindows()[0];
        const uploadResults = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const s3Key = prefix + file.name;

            try {
                await uploadFileWithAwsCli({
                    cliPath,
                    file,
                    bucketArn,
                    key: s3Key,
                    region,
                    credentials,
                    mainWindow,
                    currentIndex: i,
                    totalFiles: files.length
                });
                uploadResults.push({
                    fileName: file.name,
                    success: true,
                    key: s3Key
                });
            } catch (fileError) {
                console.error(`CLI upload error for ${file.name}:`, fileError);
                uploadResults.push({
                    fileName: file.name,
                    success: false,
                    error: fileError.message
                });
            }
        }

        return {
            success: uploadResults.every(r => r.success),
            results: uploadResults,
            totalFiles: files.length,
            successCount: uploadResults.filter(r => r.success).length,
            errorCount: uploadResults.filter(r => !r.success).length
        };

    } catch (err) {
        console.error('CLI Upload Error:', err);
        throw new Error(`CLI Upload Error: ${err.message}`);
    }
});

async function uploadFileWithAwsCli({ cliPath, file, bucketArn, key, region, credentials, mainWindow, currentIndex, totalFiles }) {
  return new Promise((resolve, reject) => {
    const s3Uri = formatS3Uri(bucketArn, key);
    const args = ['s3', 'cp', file.path, s3Uri, '--region', region];
    const env = {
      ...process.env,
      AWS_ACCESS_KEY_ID: credentials.accessKeyId,
      AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
      AWS_SESSION_TOKEN: credentials.sessionToken || '',
      AWS_REGION: region,
      AWS_CLI_PROGRESS: 'standard'
    };

    const child = spawn(cliPath, args, { env });

    const sendLog = (message) => {
      if (!message) return;
      if (mainWindow) {
        mainWindow.webContents.send('upload-progress', {
          type: 'cli-log',
          currentFile: currentIndex + 1,
          totalFiles,
          fileName: file.name,
          message
        });
      }
    };

    sendLog(`Uploading: ${file.name}`);

    const sendProgress = (percent) => {
      if (percent == null || !mainWindow) return;
      mainWindow.webContents.send('upload-progress', {
        type: 'progress',
        currentFile: currentIndex + 1,
        totalFiles,
        fileName: file.name,
        fileProgress: percent
      });
    };

    const handleStreamData = (data) => {
      const text = data.toString();
      text.split(/\r|\n/).forEach(segment => {
        const line = segment.trim();
        if (line) {
          sendLog(line);
          const percentMatch = line.match(/\((\d+)%\)/);
          if (percentMatch) {
            sendProgress(parseInt(percentMatch[1], 10));
          }
        }
      });
    };

    child.stderr.on('data', handleStreamData);

    child.stdout.on('data', handleStreamData);

    child.on('error', (err) => {
      if (mainWindow) {
        mainWindow.webContents.send('upload-progress', {
          type: 'error',
          currentFile: currentIndex + 1,
          totalFiles,
          fileName: file.name,
          message: err.message || 'Failed to start aws cli upload'
        });
      }
      reject(err);
    });

    child.on('close', (code) => {
      if (code === 0) {
        sendLog(`Completed upload: ${file.name}`);
        sendProgress(100);
        resolve({ success: true });
      } else {
        const message = `aws cli exited with code ${code}`;
        sendLog(message);
        reject(new Error(message));
      }
    });
  });
}

ipcMain.handle('create-folder', async (_, { bucketArn, accessKey, secretKey, prefix, folderName }) => {
    try {
        if (!bucketArn || !accessKey || !secretKey || !prefix || !folderName) {
            throw new Error('Missing required parameters for folder creation');
        }

        const trimmedName = folderName.trim();
        if (!trimmedName) {
            throw new Error('Folder name cannot be empty');
        }
        if (/[\\]/.test(trimmedName) || trimmedName.includes('..')) {
            throw new Error('Folder name contains invalid characters');
        }
        if (trimmedName.includes('/')) {
            throw new Error('Folder name cannot include path separators');
        }

        const region = 'us-east-1';
        const s3 = new S3Client({
            region,
            credentials: {
                accessKeyId: accessKey,
                secretAccessKey: secretKey,
            },
        });

        const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
        const folderKey = `${normalizedPrefix}${trimmedName}/`;

        const command = new PutObjectCommand({
            Bucket: bucketArn,
            Key: folderKey,
            Body: '',
            ContentType: 'application/x-directory'
        });

        await s3.send(command);

        return {
            success: true,
            key: folderKey
        };
    } catch (err) {
        console.error('Create Folder Error:', err);
        throw new Error(`Create Folder Error: ${err.message}`);
    }
});






