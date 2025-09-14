# Migration Strategy for Bash Script Users

## Overview

This document outlines the strategy for migrating from the existing bash workflow scripts to the TypeScript-based Hatchbox AI. The migration is designed to be gradual, safe, and reversible.

## Migration Philosophy

### 1. Zero Disruption
Users can continue using bash scripts while gradually adopting the TypeScript version.

### 2. Compatibility First
All existing workflows, directory structures, and conventions are preserved.

### 3. Enhanced Experience
The TypeScript version provides all bash functionality plus additional features.

### 4. Easy Rollback
Users can switch back to bash scripts at any time during the migration.

## Pre-Migration Assessment

### Current Bash Script Usage Patterns

#### Pattern 1: Issue-Based Development
```bash
# Current workflow
./scripts/new-branch-workflow.sh 25
# ... work on issue #25 ...
./scripts/merge-and-clean.sh 25
```

#### Pattern 2: PR-Based Development
```bash
# Current workflow
./scripts/new-branch-workflow.sh 148  # PR number
# ... work on PR #148 ...
./scripts/merge-and-clean.sh --pr 148
```

#### Pattern 3: Custom Branch Development
```bash
# Current workflow
./scripts/new-branch-workflow.sh feat/custom-feature
# ... work on feature ...
./scripts/merge-and-clean.sh feat/custom-feature
```

#### Pattern 4: Cleanup Operations
```bash
# Current cleanup patterns
./scripts/cleanup-worktree.sh --list
./scripts/cleanup-worktree.sh 25
./scripts/cleanup-worktree.sh --all
```

### Dependencies Assessment

#### Required Tools (Must Work)
- ✅ Git with worktree support
- ✅ GitHub CLI (`gh`)
- ✅ Claude CLI (`claude`)
- ✅ Node.js (for TypeScript version)

#### Optional Tools (Graceful Degradation)
- ⚠️ Neon CLI (`neon`) - database operations
- ⚠️ `pnpm` - dependency management
- ⚠️ `jq` - JSON parsing (replaced by native JS)

#### Platform-Specific Tools
- 🍎 `osascript` (macOS) - terminal launching
- 🐧 TBD - Linux terminal launching
- 🪟 TBD - Windows terminal launching

## Migration Phases

### Phase 1: Installation and Coexistence (Week 1)

#### Objectives
- Install TypeScript version alongside bash scripts
- Verify environment compatibility
- Test basic functionality

#### Actions
```bash
# Install globally
npm install -g claude-workspace-manager

# Or use with npx (no installation)
npx claude-workspace-manager --help

# Verify installation
cw --version
cw --help
```

#### Validation
- [ ] TypeScript CLI installed successfully
- [ ] All existing bash scripts still work
- [ ] Environment variables recognized
- [ ] External tools detected correctly

#### Compatibility Check
```bash
# Run compatibility check
cw doctor

# Expected output:
# ✅ Git worktree support: Available
# ✅ GitHub CLI: Available (v2.x.x)
# ✅ Claude CLI: Available (v1.x.x)
# ✅ Node.js: Available (v18.x.x)
# ⚠️  Neon CLI: Available (v0.x.x)
# ✅ Environment: .env file found
# ✅ Database: Neon configured
```

### Phase 2: Parallel Testing (Week 2)

#### Objectives
- Test TypeScript version with low-risk operations
- Compare behavior with bash scripts
- Build confidence in the new system

#### Testing Strategy

##### Test 1: List Operations (Safe)
```bash
# Bash version
./scripts/cleanup-worktree.sh --list

# TypeScript version
cw list

# Compare output - should show identical workspaces
```

##### Test 2: Single Worktree Creation
```bash
# Create test issue workspace with TypeScript
cw start test-issue-123

# Verify with bash script tools
./scripts/cleanup-worktree.sh --list
git worktree list

# Clean up with bash (fallback)
./scripts/cleanup-worktree.sh test-issue-123
```

##### Test 3: Full Workflow (Safe Branch)
```bash
# Complete workflow with TypeScript
cw start experimental-feature-test
# ... make some test changes ...
cw finish experimental-feature-test
```

#### Validation Criteria
- [ ] Directory structures identical
- [ ] .env files identical
- [ ] Database branches identical
- [ ] Git operations identical
- [ ] Claude context identical

### Phase 3: Gradual Command Migration (Weeks 3-4)

#### Objectives
- Replace bash scripts one command at a time
- Maintain ability to rollback
- Build muscle memory for new commands

#### Migration Order (Recommended)

##### 1. Start with Read-Only Commands
```bash
# Replace listing commands first (safest)
cw list                    # instead of ./scripts/cleanup-worktree.sh --list
cw switch issue-25         # new command, enhances workflow
```

##### 2. Replace Creation Commands
```bash
# Replace workspace creation
cw start 25               # instead of ./scripts/new-branch-workflow.sh 25
cw start 148              # instead of ./scripts/new-branch-workflow.sh 148
```

##### 3. Replace Cleanup Commands
```bash
# Replace cleanup operations
cw cleanup issue-25       # instead of ./scripts/cleanup-worktree.sh 25
cw cleanup --all          # instead of ./scripts/cleanup-worktree.sh --all
```

##### 4. Replace Merge Commands (Last)
```bash
# Replace merge operations (most complex)
cw finish 25              # instead of ./scripts/merge-and-clean.sh 25
```

#### Command Mapping Reference

| Bash Script | TypeScript Equivalent | Notes |
|-------------|----------------------|-------|
| `./scripts/new-branch-workflow.sh 25` | `cw start 25` | Identical functionality |
| `./scripts/new-branch-workflow.sh --pr 148` | `cw start 148` | Auto-detects PR vs issue |
| `./scripts/merge-and-clean.sh 25` | `cw finish 25` | Identical functionality |
| `./scripts/merge-and-clean.sh --pr 148` | `cw finish 148` | Auto-detects PR vs issue |
| `./scripts/cleanup-worktree.sh --list` | `cw list` | Enhanced with colors/status |
| `./scripts/cleanup-worktree.sh 25` | `cw cleanup 25` | Identical functionality |
| `./scripts/cleanup-worktree.sh --all` | `cw cleanup --all` | Identical functionality |
| `./scripts/merge-current-issue.sh` | `cw finish` (auto-detect) | Simplified usage |

### Phase 4: Full Migration (Week 5)

#### Objectives
- Use TypeScript version exclusively
- Archive bash scripts safely
- Validate complete migration

#### Actions

##### Archive Bash Scripts
```bash
# Create backup directory
mkdir -p .archive/bash-scripts
mv scripts/ .archive/bash-scripts/

# Update any documentation references
# Update any CI/CD scripts
# Update team documentation
```

##### Validation
```bash
# Verify all workflows still work
cw start 999               # Test issue workflow
cw start test-pr-branch    # Test custom branch workflow
cw list                    # Verify workspace listing
cw finish 999              # Test merge workflow
cw cleanup --all           # Test cleanup
```

#### Rollback Plan
If issues are discovered, rollback is simple:
```bash
# Restore bash scripts
mv .archive/bash-scripts/scripts/ ./

# Continue using bash scripts
./scripts/new-branch-workflow.sh 25
```

### Phase 5: Enhancement Adoption (Week 6+)

#### Objectives
- Adopt TypeScript-specific enhancements
- Customize configuration
- Explore advanced features

#### New Features to Explore

##### Enhanced Listing
```bash
# Rich workspace information
cw list                    # Shows ports, database status, last activity

# Specific workspace info
cw info 25                 # Detailed info about workspace
```

##### Improved Switching
```bash
# Quick context switching
cw switch 25               # Navigate + show context

# Switch with Claude launch
cw switch 25 --claude      # Switch and launch Claude
```

##### Configuration Customization
```bash
# Global configuration
cw config set database.provider neon
cw config set claude.model opus
cw config set workspace.autoInstall true

# Project-specific configuration
cd my-project
cw config set --local claude.instructions "You are a React expert"
```

##### Advanced Workflows
```bash
# Parallel workspace operations
cw start 25 30 31          # Create multiple workspaces

# Template-based creation
cw start 25 --template react-component

# Workspace backup/restore
cw backup my-workspace
cw restore my-workspace
```

## Migration Safety Measures

### 1. Data Protection

#### Workspace Data
- All existing worktrees preserved
- Database branches unchanged
- .env files maintained
- Git history intact

#### Backup Verification
```bash
# Before migration, backup critical data
cp -r .env .env.backup
git worktree list > worktree-backup.txt
git branch -a > branches-backup.txt

# Verify after migration
diff .env .env.backup
diff <(git worktree list) worktree-backup.txt
```

### 2. Process Validation

#### Automated Testing
```bash
# Test script for validation
#!/bin/bash
set -e

echo "Testing workspace creation..."
cw start test-validation-$(date +%s)
WORKSPACE_COUNT=$(cw list | wc -l)
echo "✅ Created workspace successfully"

echo "Testing workspace cleanup..."
cw cleanup --all --force
REMAINING_COUNT=$(cw list | wc -l)
[ $REMAINING_COUNT -eq 0 ] && echo "✅ Cleanup successful"
```

#### Manual Verification Checklist
- [ ] Can create issue-based workspace
- [ ] Can create PR-based workspace
- [ ] Can create custom branch workspace
- [ ] Port assignment works correctly
- [ ] Database branch creation works
- [ ] .env file copying works
- [ ] Claude integration works
- [ ] Merge workflow works
- [ ] Cleanup removes all resources

### 3. Team Migration Coordination

#### Communication Plan
1. **Announcement**: Notify team of migration timeline
2. **Training**: Share migration guide and new commands
3. **Support**: Provide help during transition period
4. **Feedback**: Collect issues and improvements

#### Staggered Team Migration
```bash
# Week 1: Tech leads migrate
# Week 2: Senior developers migrate
# Week 3: All developers migrate
# Week 4: Archive bash scripts
```

## Troubleshooting Common Migration Issues

### Issue 1: Command Not Found
```bash
# Problem
cw: command not found

# Solutions
npm install -g claude-workspace-manager  # Global install
npx claude-workspace-manager --help       # Direct execution
export PATH="$PATH:$(npm bin -g)"        # Fix PATH
```

### Issue 2: Permission Errors
```bash
# Problem
Permission denied when creating worktrees

# Solutions
sudo chown -R $USER:$GROUP ~/.npm      # Fix npm permissions
npm config set prefix ~/.npm-global    # Use user directory
export PATH="$PATH:~/.npm-global/bin"  # Update PATH
```

### Issue 3: Environment Variables Not Found
```bash
# Problem
Database configuration not found

# Solutions
cp .env.example .env                    # Create .env file
source .env                             # Load environment
cw doctor                               # Verify configuration
```

### Issue 4: Git Worktree Conflicts
```bash
# Problem
Worktree already exists

# Solutions
cw cleanup --all                        # Clean all worktrees
git worktree prune                      # Clean git worktree list
rm -rf ../workspace-*                   # Manual cleanup
```

### Issue 5: Database Branch Conflicts
```bash
# Problem
Database branch already exists

# Solutions
cw cleanup issue-25                     # Clean specific issue
neon branches delete branch-name        # Manual Neon cleanup
cw doctor --fix                         # Auto-fix common issues
```

## Success Metrics

### Technical Metrics
- [ ] Zero data loss during migration
- [ ] All bash script functionality replicated
- [ ] Performance equal or better than bash scripts
- [ ] Error rate less than 1%

### User Experience Metrics
- [ ] Migration completed within planned timeline
- [ ] User satisfaction maintained or improved
- [ ] Support tickets reduced after migration
- [ ] Team productivity maintained or improved

### Operational Metrics
- [ ] CI/CD pipelines updated successfully
- [ ] Documentation updated completely
- [ ] Team training completed
- [ ] Rollback plan tested and validated

## Post-Migration Maintenance

### 1. Monitoring
```bash
# Regular health checks
cw doctor                               # System health
cw list --check                         # Workspace health
git worktree prune                      # Clean orphaned worktrees
```

### 2. Updates
```bash
# Keep TypeScript version updated
npm update -g claude-workspace-manager
cw --version                            # Verify update
```

### 3. Feedback Collection
- Monitor for new issues or feature requests
- Collect team feedback on improved workflows
- Plan future enhancements based on usage patterns

### 4. Optimization
- Profile command performance
- Optimize frequently used workflows
- Add new features based on team needs

This migration strategy ensures a safe, gradual transition from bash scripts to the TypeScript implementation while maintaining all existing functionality and providing a clear path forward for teams.