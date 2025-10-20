# Database Backup and Recovery Guide

## Overview

The Bibidi Backend uses **Amazon RDS PostgreSQL** with automated backups, point-in-time recovery, and multi-AZ deployment for high availability.

## Automated Backup Configuration

### ✅ What's Already Configured

The CloudFormation template automatically sets up:

1. **Automated Daily Backups**
   - Retention period: 7 days
   - Backup window: 3:00-4:00 AM EST (Canada Central time)
   - Backups stored in Amazon S3 (encrypted)

2. **Point-in-Time Recovery (PITR)**
   - Can restore to any point within the last 7 days
   - Granularity: Down to the second
   - Automatic transaction log backups

3. **Multi-AZ Deployment**
   - Synchronous replication to standby instance
   - Automatic failover in case of primary failure
   - Zero data loss during failover

4. **Snapshot on Deletion**
   - Final snapshot created automatically if database is deleted
   - Protection against accidental data loss

5. **Enhanced Monitoring**
   - Performance Insights enabled (7-day retention)
   - CloudWatch metrics for CPU, storage, connections
   - Database logs exported to CloudWatch

---

## Backup Schedule

| Backup Type | Frequency | Retention | Recovery Time |
|-------------|-----------|-----------|---------------|
| Automated Backup | Daily at 3 AM | 7 days | 5-15 minutes |
| Transaction Logs | Continuous | 7 days | 1-2 minutes (PITR) |
| Manual Snapshots | On-demand | Until deleted | 5-15 minutes |
| Final Snapshot | On deletion | Until deleted | 5-15 minutes |

---

## Creating Manual Snapshots

### Via AWS CLI

```bash
# Create a manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier production-bibidi-postgres \
  --db-snapshot-identifier bibidi-manual-snapshot-$(date +%Y%m%d-%H%M%S) \
  --region ca-central-1

# List all snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier production-bibidi-postgres \
  --region ca-central-1
```

### Via AWS Console

1. Go to: https://ca-central-1.console.aws.amazon.com/rds/
2. Select **Databases** → `production-bibidi-postgres`
3. Click **Actions** → **Take snapshot**
4. Enter snapshot name: `bibidi-manual-YYYYMMDD`
5. Click **Take snapshot**

---

## Restoring from Backup

### Option 1: Point-in-Time Recovery (Recommended)

Restore to a specific time (within the last 7 days):

```bash
# Restore to a specific time
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier production-bibidi-postgres \
  --target-db-instance-identifier production-bibidi-postgres-restored \
  --restore-time 2025-10-19T12:00:00Z \
  --region ca-central-1

# Or restore to latest restorable time
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier production-bibidi-postgres \
  --target-db-instance-identifier production-bibidi-postgres-restored \
  --use-latest-restorable-time \
  --region ca-central-1
```

### Option 2: Restore from Snapshot

```bash
# List available snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier production-bibidi-postgres \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime]' \
  --output table \
  --region ca-central-1

# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier production-bibidi-postgres-restored \
  --db-snapshot-identifier bibidi-manual-snapshot-20251019-120000 \
  --region ca-central-1
```

### After Restoration

1. **Wait for the new instance to be available** (5-15 minutes)
2. **Update the connection string** in your application
3. **Test the restored database**
4. **If successful, delete the old database** (creates final snapshot)

---

## Scheduled Snapshot Lambda Function (Advanced)

For more frequent backups or custom retention, create a Lambda function:

```python
import boto3
from datetime import datetime

def lambda_handler(event, context):
    rds = boto3.client('rds', region_name='ca-central-1')
    
    # Create snapshot
    snapshot_id = f"bibidi-scheduled-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    
    response = rds.create_db_snapshot(
        DBInstanceIdentifier='production-bibidi-postgres',
        DBSnapshotIdentifier=snapshot_id
    )
    
    print(f"Created snapshot: {snapshot_id}")
    
    # Clean up old snapshots (keep last 30)
    snapshots = rds.describe_db_snapshots(
        DBInstanceIdentifier='production-bibidi-postgres',
        SnapshotType='manual'
    )['DBSnapshots']
    
    # Sort by create time
    snapshots.sort(key=lambda x: x['SnapshotCreateTime'], reverse=True)
    
    # Delete old snapshots
    for snapshot in snapshots[30:]:
        if snapshot['DBSnapshotIdentifier'].startswith('bibidi-scheduled-'):
            rds.delete_db_snapshot(
                DBSnapshotIdentifier=snapshot['DBSnapshotIdentifier']
            )
            print(f"Deleted old snapshot: {snapshot['DBSnapshotIdentifier']}")
    
    return {'statusCode': 200, 'body': f'Created {snapshot_id}'}
```

### Schedule with EventBridge

```bash
# Create CloudWatch Events rule (runs every 6 hours)
aws events put-rule \
  --name bibidi-database-backup \
  --schedule-expression "rate(6 hours)" \
  --region ca-central-1

# Add Lambda as target
aws events put-targets \
  --rule bibidi-database-backup \
  --targets "Id"="1","Arn"="arn:aws:lambda:ca-central-1:ACCOUNT_ID:function:bibidi-backup-function" \
  --region ca-central-1
```

---

## Backup Verification

### Test Restore Process (Monthly Recommended)

```bash
# 1. Create test restore
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier production-bibidi-postgres \
  --target-db-instance-identifier test-restore-$(date +%Y%m%d) \
  --use-latest-restorable-time \
  --db-instance-class db.t3.micro \
  --no-multi-az \
  --region ca-central-1

# 2. Wait for availability
aws rds wait db-instance-available \
  --db-instance-identifier test-restore-$(date +%Y%m%d) \
  --region ca-central-1

# 3. Test connection
psql -h <endpoint> -U bibidi_admin -d postgres -c "SELECT COUNT(*) FROM users;"

# 4. Delete test instance
aws rds delete-db-instance \
  --db-instance-identifier test-restore-$(date +%Y%m%d) \
  --skip-final-snapshot \
  --region ca-central-1
```

---

## Disaster Recovery Plan

### RTO (Recovery Time Objective): 15 minutes
### RPO (Recovery Point Objective): < 5 minutes

### Scenario 1: Database Corruption
```bash
# Restore to point before corruption
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier production-bibidi-postgres \
  --target-db-instance-identifier production-bibidi-postgres-recovered \
  --restore-time 2025-10-19T10:00:00Z \
  --region ca-central-1
```

### Scenario 2: Accidental Data Deletion
```bash
# Use PITR to recover to just before deletion
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier production-bibidi-postgres \
  --target-db-instance-identifier production-bibidi-postgres-recovered \
  --restore-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ) \
  --region ca-central-1
```

### Scenario 3: Complete Database Loss
```bash
# Restore from most recent automated backup
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier production-bibidi-postgres \
  --target-db-instance-identifier production-bibidi-postgres-new \
  --use-latest-restorable-time \
  --region ca-central-1
```

---

## Monitoring Backups

### CloudWatch Alarms

```bash
# Alert if backup fails
aws cloudwatch put-metric-alarm \
  --alarm-name bibidi-db-backup-failed \
  --alarm-description "Alert when RDS backup fails" \
  --metric-name BackupRetentionPeriodStorageUsed \
  --namespace AWS/RDS \
  --statistic Average \
  --period 86400 \
  --evaluation-periods 1 \
  --threshold 0 \
  --comparison-operator LessThanOrEqualToThreshold \
  --dimensions Name=DBInstanceIdentifier,Value=production-bibidi-postgres \
  --region ca-central-1
```

### Check Backup Status

```bash
# View automated backups
aws rds describe-db-instances \
  --db-instance-identifier production-bibidi-postgres \
  --query 'DBInstances[0].[LatestRestorableTime,BackupRetentionPeriod]' \
  --region ca-central-1

# View manual snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier production-bibidi-postgres \
  --snapshot-type manual \
  --region ca-central-1
```

---

## Cost Optimization

### Backup Storage Costs

- **Automated backups**: Free up to database size
- **Manual snapshots**: $0.095/GB-month (ca-central-1)
- **Point-in-time recovery**: Free (included in automated backups)

### Best Practices

1. **Use automated backups** for daily recovery (free)
2. **Create manual snapshots** before major changes
3. **Delete old manual snapshots** after 30 days
4. **Export old snapshots to S3** for long-term archival (cheaper)

---

## Backup Checklist

### Daily (Automated)
- [ ] Automated backup runs at 3 AM
- [ ] Transaction logs continuously backed up
- [ ] Monitor CloudWatch for backup success

### Weekly
- [ ] Review backup metrics in RDS console
- [ ] Check available storage space
- [ ] Verify latest restorable time

### Monthly
- [ ] Perform test restore to verify backups
- [ ] Review and delete old manual snapshots
- [ ] Update disaster recovery documentation

### Before Major Changes
- [ ] Create manual snapshot
- [ ] Document the changes
- [ ] Keep snapshot until changes are verified

---

## Additional Resources

- [RDS Backup Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html)
- [Point-in-Time Recovery](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html)
- [RDS Best Practices](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_BestPractices.html)

---

## Support Contacts

**AWS Support**: https://console.aws.amazon.com/support/  
**RDS Documentation**: https://docs.aws.amazon.com/rds/  
**Emergency Recovery**: Follow disaster recovery plan above

---

**Last Updated**: October 19, 2025
