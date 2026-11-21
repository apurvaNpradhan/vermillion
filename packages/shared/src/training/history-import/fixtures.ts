/**
 * Exports written from the documented column layouts of Strong and Hevy, with made-up workouts.
 * Strong: `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,
 * Workout Notes,RPE` (newer builds add units to the headers: `Duration (sec)`, `Weight (kg)`,
 * `Distance (meters)`); a `Rest Timer` row sits between sets; `W`, `D` and `F` mark a warm-up,
 * drop and failure set. Hevy: `title,start_time,end_time,description,exercise_title,superset_id,
 * exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe`.
 */
export const STRONG_COMMA = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2026-03-02 18:30:00,Push Day,1h 5m,Bench Press (Barbell),W,40,8,0,0,,"Felt good, 
 left shoulder tight",
2026-03-02 18:30:00,Push Day,1h 5m,Bench Press (Barbell),1,60,5,0,0,"Paused ""touch and go""","Felt good, 
 left shoulder tight",8
2026-03-02 18:30:00,Push Day,1h 5m,Bench Press (Barbell),Rest Timer,0,0,0,120,,,
2026-03-02 18:30:00,Push Day,1h 5m,Bench Press (Barbell),2,60,5,0,0,,,8.5
2026-03-02 18:30:00,Push Day,1h 5m,Bench Press (Barbell),D,50,6,0,0,,,
2026-03-02 18:30:00,Push Day,1h 5m,Plank,1,0,0,0,60,,,
2026-03-02 18:30:00,Push Day,1h 5m,Pull Up,1,0,10,0,0,,,
2026-03-05 07:00:00,Run,32m,Running,1,0,0,5000,1800,,,
`;

export const STRONG_UNITS = `Date,Workout Name,Duration (sec),Exercise Name,Set Order,Weight (lbs),Reps,Distance (meters),Seconds,Notes,Workout Notes,RPE
2026-03-02 18:30:00,Leg Day,3900,Squat (Barbell),1,135,5,0,0,,,
2026-03-02 18:30:00,Leg Day,3900,Squat (Barbell),F,135,3,0,0,,,
`;

export const STRONG_SEMICOLON = `Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE
15/03/2026 18:30;Pull;45m;Deadlift (Barbell);1;102,5;5;0;0;;;
15/03/2026 18:30;Pull;45m;Deadlift (Barbell);2;102,5;4;0;0;;;
27/03/2026 08:00;Pull;50m;Deadlift (Barbell);1;105;5;0;0;;;
`;

export const HEVY = `"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"
"Upper","15 Jan 2026, 10:30","15 Jan 2026, 11:42","","Bench Press (Barbell)","0","",0,"warmup",40,8,,,
"Upper","15 Jan 2026, 10:30","15 Jan 2026, 11:42","","Bench Press (Barbell)","0","",1,"normal",70,5,,,8
"Upper","15 Jan 2026, 10:30","15 Jan 2026, 11:42","","Bench Press (Barbell)","0","",2,"dropset",60,8,,,
"Upper","15 Jan 2026, 10:30","15 Jan 2026, 11:42","","Bent Over Row (Barbell)","0","Strict",0,"normal",60,8,,,
"Upper","15 Jan 2026, 10:30","15 Jan 2026, 11:42","","Dead Hang","","",0,"normal",,,,45,
"Cardio","17 Jan 2026, 07:00","17 Jan 2026, 07:30","Easy pace","Running","","",0,"normal",,,5,1800,
`;

export const HEVY_LBS_MILES = `title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_lbs,reps,distance_miles,duration_seconds,rpe
Upper,"15 Jan 2026, 10:30","15 Jan 2026, 11:42",,Bench Press (Barbell),,,0,normal,155,5,,,
Cardio,"17 Jan 2026, 07:00","17 Jan 2026, 07:30",,Running,,,0,normal,,,3.1,1800,
`;
