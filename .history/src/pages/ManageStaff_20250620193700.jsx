import React, { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

const defaultWeeklyHours = {
  Monday: { start: '', end: '', off: false },
  Tuesday: { start: '', end: '', off: false },
  Wednesday: { start: '', end: '', off: false },
  Thursday: { start: '', end: '', off: false },
  Friday: { start: '', end: '', off: false },
  Saturday: { start: '', end: '', off: false },
  Sunday: { start: '', end: '', off: false },
};

export default function ManageStaff() {
  const [staff, setStaff] = useState([]);
  const [formData, setFormData] = useState({
    id: null,
    name: '',
    email: '',
    pin: '',
    role: 'staff',
    weekly_hours: defaultWeeklyHours,
  });

  const [editing, setEditing] = useState(false);

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    const { data, error } = await supabase.from('staff').select('*');
    if (error) {
      console.error('Fetch error:', error);
    } else {
      setStaff(data);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleWeeklyHourChange = (day, field, value) => {
    setFormData((prev) => ({
      ...prev,
      weekly_hours: {
        ...prev.weekly_hours,
        [day]: {
          ...prev.weekly_hours[day],
          [field]: field === 'off' ? !prev.weekly_hours[day].off : value,
        },
      },
    }));
  };

  const handleSubmit = async () => {
    const payload = {
      name: formData.name,
      email: formData.email,
      pin: formData.pin,
      role: formData.role,
      weekly_hours: formData.weekly_hours,
    };

    try {
      let response;
      if (editing && formData.id) {
        response = await supabase
          .from('staff')
          .update(payload)
          .eq('id', formData.id);
      } else {
        response = await supabase.from('staff').insert([payload]);
      }

      if (response.error) throw response.error;

      toast.success('Staff saved successfully');
      fetchStaff();
      setFormData({ id: null, name: '', email: '', pin: '', role: 'staff', weekly_hours: defaultWeeklyHours });
      setEditing(false);
    } catch (error) {
      console.error('Update error:', error);
      toast.error('Error saving staff');
    }
  };

  const handleEdit = (member) => {
    console.log('Editing member:', member);
    setFormData({
      id: member.id,
      name: member.name,
      email: member.email || '',
      pin: member.pin,
      role: member.role,
      weekly_hours: member.weekly_hours || defaultWeeklyHours,
    });
    setEditing(true);
  };

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{editing ? 'Edit Staff' : 'Add Staff'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input name="name" value={formData.name} onChange={handleChange} placeholder="Name" />
          <Input name="email" value={formData.email} onChange={handleChange} placeholder="Email" />
          <Input name="pin" value={formData.pin} onChange={handleChange} placeholder="PIN" />
          <Input name="role" value={formData.role} onChange={handleChange} placeholder="Role" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(formData.weekly_hours).map(([day, config]) => (
              <div key={day}>
                <Label>{day}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Start"
                    value={config.start}
                    onChange={(e) => handleWeeklyHourChange(day, 'start', e.target.value)}
                  />
                  <Input
                    placeholder="End"
                    value={config.end}
                    onChange={(e) => handleWeeklyHourChange(day, 'end', e.target.value)}
                  />
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={config.off}
                      onChange={() => handleWeeklyHourChange(day, 'off')}
                    />
                    Off
                  </label>
                </div>
              </div>
            ))}
          </div>

          <Button onClick={handleSubmit}>{editing ? 'Update Staff' : 'Add Staff'}</Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {staff.map((member) => (
          <Card key={member.id}>
            <CardHeader>
              <CardTitle>{member.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>Email: {member.email || 'None'}</p>
              <p>Role: {member.role}</p>
              <p>PIN: {member.pin}</p>
              <Button variant="outline" onClick={() => handleEdit(member)}>
                Edit
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
