# Deploying to Google Cloud Run

This guide provides step-by-step instructions for deploying the Network Planning & Design Tool to Google Cloud Run.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start (CLI)](#quick-start-cli)
- [Detailed CLI Deployment](#detailed-cli-deployment)
- [Deployment via Google Cloud Console (UI)](#deployment-via-google-cloud-console-ui)
- [CI/CD with GitHub Actions](#cicd-with-github-actions)
- [Configuration Options](#configuration-options)
- [Troubleshooting](#troubleshooting)
- [Cost Optimization](#cost-optimization)

---

## Prerequisites

### Required Tools

1. **Google Cloud SDK (gcloud CLI)**
   ```bash
   # macOS
   brew install google-cloud-sdk

   # Linux (Debian/Ubuntu)
   curl https://sdk.cloud.google.com | bash
   exec -l $SHELL
   gcloud init

   # Verify installation
   gcloud version
   ```

2. **Docker** (for local builds)
   ```bash
   # Verify Docker is running
   docker --version
   ```

3. **A Google Cloud Project** with billing enabled

### Required APIs

Enable the following APIs in your GCP project:

```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  containerregistry.googleapis.com
```

---

## Quick Start (CLI)

Deploy in under 5 minutes:

```bash
# 1. Set your project
export PROJECT_ID="your-project-id"
gcloud config set project $PROJECT_ID

# 2. Build and deploy in one command
gcloud run deploy network-planning-tool \
  --source . \
  --dockerfile Dockerfile.cloudrun \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1

# 3. Get the URL
gcloud run services describe network-planning-tool \
  --region us-central1 \
  --format 'value(status.url)'
```

---

## Detailed CLI Deployment

### Step 1: Authenticate with Google Cloud

```bash
# Login to your Google account
gcloud auth login

# Set your project ID
export PROJECT_ID="your-project-id"
gcloud config set project $PROJECT_ID

# Verify configuration
gcloud config list
```

### Step 2: Create Artifact Registry Repository

Create a Docker repository to store your container images:

```bash
# Set region
export REGION="us-central1"

# Create repository
gcloud artifacts repositories create network-planning-tool \
  --repository-format=docker \
  --location=$REGION \
  --description="Network Planning Tool Docker images"

# Configure Docker to use Artifact Registry
gcloud auth configure-docker ${REGION}-docker.pkg.dev
```

### Step 3: Build the Docker Image

```bash
# Build locally
docker build -f Dockerfile.cloudrun -t network-planning-tool:latest .

# Tag for Artifact Registry
docker tag network-planning-tool:latest \
  ${REGION}-docker.pkg.dev/${PROJECT_ID}/network-planning-tool/network-planning-tool:latest

# Push to Artifact Registry
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/network-planning-tool/network-planning-tool:latest
```

**Alternative: Use Cloud Build**

```bash
# Build using Cloud Build (no local Docker required)
gcloud builds submit \
  --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/network-planning-tool/network-planning-tool:latest \
  --dockerfile Dockerfile.cloudrun
```

### Step 4: Deploy to Cloud Run

```bash
# Deploy the container
gcloud run deploy network-planning-tool \
  --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/network-planning-tool/network-planning-tool:latest \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 80 \
  --timeout 60s

# Get the service URL
SERVICE_URL=$(gcloud run services describe network-planning-tool \
  --region $REGION \
  --format 'value(status.url)')

echo "Deployed to: $SERVICE_URL"
```

### Step 5: Verify Deployment

```bash
# Health check
curl -s "$SERVICE_URL/health"

# Open in browser
open "$SERVICE_URL"  # macOS
xdg-open "$SERVICE_URL"  # Linux
```

---

## Deployment via Google Cloud Console (UI)

### Step 1: Open Cloud Run Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project from the dropdown
3. Navigate to **Cloud Run** (search in the top bar or find in the left menu)
4. Click **Create Service**

### Step 2: Configure Service Source

**Option A: Deploy from Source Code**

1. Select **"Continuously deploy from a repository (source)"**
2. Click **Set up with Cloud Build**
3. Connect your GitHub repository
4. Select the repository and branch
5. In **Build Configuration**:
   - Build Type: **Dockerfile**
   - Source location: `/Dockerfile.cloudrun`
6. Click **Save**

**Option B: Deploy from Container Image**

1. Select **"Deploy one revision from an existing container image"**
2. Click **Select** next to Container Image URL
3. If you've pushed to Artifact Registry:
   - Navigate to your repository
   - Select the image tag
4. Click **Select**

### Step 3: Configure Service Settings

| Setting | Value |
|---------|-------|
| Service name | `network-planning-tool` |
| Region | `us-central1` (or your preferred region) |
| CPU allocation | **CPU is only allocated during request processing** |
| Minimum instances | `0` |
| Maximum instances | `10` |

### Step 4: Configure Container Settings

1. Expand **Container, Networking, Security** section
2. Under **Container**:
   | Setting | Value |
   |---------|-------|
   | Container port | `8080` |
   | Memory | `512 MiB` |
   | CPU | `1` |
   | Request timeout | `60` seconds |
   | Maximum concurrent requests | `80` |

### Step 5: Configure Authentication

1. Under **Authentication**:
   - Select **"Allow unauthenticated invocations"** for public access
   - Or select **"Require authentication"** for private access

### Step 6: Deploy

1. Click **Create** (or **Deploy** if updating)
2. Wait for deployment to complete (1-3 minutes)
3. Click the service URL to open the application

### Step 7: View Deployment Details

After deployment:

1. Click on the service name to view details
2. See **Metrics** tab for traffic and performance
3. See **Logs** tab for application logs
4. See **Revisions** tab to manage versions

---

## CI/CD with GitHub Actions

### Step 1: Create a Service Account

```bash
# Create service account
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions Deployer"

# Grant required permissions
export SA_EMAIL="github-actions@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"

# Create and download key
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=$SA_EMAIL

# IMPORTANT: Store this key securely, then delete the local copy
cat github-actions-key.json
```

### Step 2: Configure GitHub Secrets

In your GitHub repository, go to **Settings > Secrets and variables > Actions** and add:

| Secret Name | Value |
|-------------|-------|
| `GCP_PROJECT_ID` | Your Google Cloud project ID |
| `GCP_SA_KEY` | Contents of `github-actions-key.json` (entire JSON) |

Optional variables (Settings > Secrets and variables > Actions > Variables):

| Variable Name | Value |
|---------------|-------|
| `GCP_REGION` | `us-central1` (or your preferred region) |

### Step 3: Create Artifact Registry Repository

```bash
gcloud artifacts repositories create network-planning-tool \
  --repository-format=docker \
  --location=$REGION \
  --description="Network Planning Tool CI/CD images"
```

### Step 4: Trigger Deployment

The workflow triggers automatically on:
- Push to `main` or `master` branch
- Pull requests to `main` or `master`
- Manual trigger via **Actions > Deploy to Cloud Run > Run workflow**

### Workflow Features

The CI/CD pipeline includes:

1. **Test Job**: Linting and unit tests
2. **Build Job**: Docker image build and push to Artifact Registry
3. **Deploy Job**: Deploy to Cloud Run
4. **Smoke Test**: Verify deployment health

---

## Configuration Options

### Cloud Run Service Settings

```bash
gcloud run services update network-planning-tool \
  --region $REGION \
  --memory 1Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 20 \
  --concurrency 100
```

### Custom Domain

```bash
# Map a custom domain
gcloud run domain-mappings create \
  --service network-planning-tool \
  --domain your-domain.com \
  --region $REGION

# Get DNS records to configure
gcloud run domain-mappings describe \
  --domain your-domain.com \
  --region $REGION
```

### Environment Variables

```bash
gcloud run services update network-planning-tool \
  --region $REGION \
  --set-env-vars "KEY1=value1,KEY2=value2"
```

---

## Troubleshooting

### Common Issues

#### 1. "Container failed to start"

Check container logs:
```bash
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=network-planning-tool" \
  --limit 50 \
  --format "value(textPayload)"
```

Common causes:
- Port mismatch (must use `PORT` env variable)
- Missing dependencies
- Build errors

#### 2. "Permission denied" errors

Ensure the service account has required permissions:
```bash
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:github-actions@${PROJECT_ID}.iam.gserviceaccount.com"
```

#### 3. Slow cold starts

Increase minimum instances:
```bash
gcloud run services update network-planning-tool \
  --region $REGION \
  --min-instances 1
```

#### 4. Image not found

Verify image exists:
```bash
gcloud artifacts docker images list \
  ${REGION}-docker.pkg.dev/${PROJECT_ID}/network-planning-tool
```

### View Logs

```bash
# Stream logs
gcloud run services logs tail network-planning-tool --region $REGION

# View recent logs
gcloud run services logs read network-planning-tool --region $REGION --limit 100
```

### Check Service Status

```bash
gcloud run services describe network-planning-tool \
  --region $REGION \
  --format yaml
```

---

## Cost Optimization

### Recommended Settings for Testing

```bash
gcloud run deploy network-planning-tool \
  --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/network-planning-tool/network-planning-tool:latest \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2 \
  --concurrency 80
```

### Free Tier Limits (as of 2024)

Cloud Run free tier includes:
- 2 million requests per month
- 360,000 GB-seconds of memory
- 180,000 vCPU-seconds
- 1 GB outbound data transfer (North America)

### Cost Monitoring

```bash
# Set up budget alert
gcloud billing budgets create \
  --billing-account=YOUR_BILLING_ACCOUNT_ID \
  --display-name="Cloud Run Budget" \
  --budget-amount=50 \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=90
```

---

## Cleanup

Remove all resources when done testing:

```bash
# Delete Cloud Run service
gcloud run services delete network-planning-tool --region $REGION --quiet

# Delete Artifact Registry repository (and all images)
gcloud artifacts repositories delete network-planning-tool \
  --location $REGION --quiet

# Delete service account
gcloud iam service-accounts delete github-actions@${PROJECT_ID}.iam.gserviceaccount.com --quiet
```

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `gcloud run deploy` | Deploy a new revision |
| `gcloud run services list` | List all services |
| `gcloud run services describe SERVICE` | Get service details |
| `gcloud run services logs read SERVICE` | View logs |
| `gcloud run revisions list` | List revisions |
| `gcloud run services update SERVICE` | Update configuration |
| `gcloud run services delete SERVICE` | Delete service |

---

## Related Documentation

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud Run Pricing](https://cloud.google.com/run/pricing)
- [Cloud Build Documentation](https://cloud.google.com/build/docs)
- [Artifact Registry Documentation](https://cloud.google.com/artifact-registry/docs)
