'use strict';

const { errorHandler } = require('../middleware/errorHandler');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('errorHandler', () => {
  test('translates a user_id foreign key violation into a clean 401, not a raw DB error', () => {
    const res = mockRes();
    const err = Object.assign(new Error('insert or update on table "attendance" violates foreign key constraint "attendance_user_id_fkey"'), {
      code: '23503',
      constraint: 'attendance_user_id_fkey',
    });

    errorHandler(err, {}, res, () => {});

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Your session is no longer valid. Please log in again.' });
  });

  test('leaves unrelated foreign key violations (e.g. an invalid leave_type_id) as a generic error, not a fake 401', () => {
    const res = mockRes();
    const err = Object.assign(new Error('insert or update on table "leave_applications" violates foreign key constraint "leave_applications_leave_type_id_fkey"'), {
      code: '23503',
      constraint: 'leave_applications_leave_type_id_fkey',
    });

    errorHandler(err, {}, res, () => {});

    expect(res.status).not.toHaveBeenCalledWith(401);
  });

  test('passes through a normal application error with its own status and message', () => {
    const res = mockRes();
    const err = Object.assign(new Error('Employee not found.'), { status: 404 });

    errorHandler(err, {}, res, () => {});

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Employee not found.' });
  });
});
