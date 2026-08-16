require('dotenv').config();
const { query, pool } = require('./src/db/pool');

async function syncBalances() {
  try {
    const currentYear = new Date().getFullYear();
    
    // 1. Delete inactive leave balances and ledgers where there is no actual usage
    await query(`
      DELETE FROM leave_balances 
      WHERE used = 0 AND leave_type_id IN (SELECT id FROM leave_types WHERE is_active = FALSE)
    `);
    
    await query(`
      DELETE FROM leave_ledger 
      WHERE entry_type = 'INITIAL_ALLOCATION' 
      AND leave_type_id IN (SELECT id FROM leave_types WHERE is_active = FALSE)
      AND NOT EXISTS (
         SELECT 1 FROM leave_ledger ll2 
         WHERE ll2.user_id = leave_ledger.user_id 
         AND ll2.leave_type_id = leave_ledger.leave_type_id 
         AND ll2.entry_type != 'INITIAL_ALLOCATION'
      )
    `);

    // 2. Sync active ones
    const { rows: types } = await query('SELECT id, yearly_quota FROM leave_types WHERE is_active = TRUE');
    
    for (const type of types) {
       // Update leave_balances
       await query(
         `UPDATE leave_balances 
          SET allotted = $1, 
              updated_at = NOW() 
          WHERE leave_type_id = $2 AND year = $3`,
         [type.yearly_quota, type.id, currentYear]
       );
       
       // Update the INITIAL_ALLOCATION entry in leave_ledger
       await query(
         `UPDATE leave_ledger
          SET amount = $1,
              resulting_balance = $1
          WHERE leave_type_id = $2 AND entry_type = 'INITIAL_ALLOCATION' AND year = $3`,
         [type.yearly_quota, type.id, currentYear]
       );
    }
    console.log('Successfully synced leave balances and ledger.');
  } catch (err) {
    console.error('Error syncing balances:', err);
  } finally {
    pool.end();
  }
}

syncBalances();
