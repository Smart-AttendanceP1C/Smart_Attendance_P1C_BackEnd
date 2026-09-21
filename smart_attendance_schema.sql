--
-- PostgreSQL database dump
--

\restrict Gb8RKqgkeUsfyo1LjN6QCUUPBel5gli9OUPPNdQw0OkJhqR5CmJusi9irypiPTw

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

-- Started on 2026-09-20 23:56:07

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 2 (class 3079 OID 24785)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- TOC entry 5166 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 235 (class 1259 OID 24714)
-- Name: attendance_event; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance_event (
    id bigint NOT NULL,
    session_id bigint NOT NULL,
    student_id bigint NOT NULL,
    scanned_at timestamp without time zone,
    validation_status character varying(30),
    rejection_reason character varying(255),
    attendance_status character varying(20),
    CONSTRAINT chk_attendance_status CHECK (((attendance_status)::text = ANY ((ARRAY['present'::character varying, 'absent'::character varying, 'excused'::character varying])::text[])))
);


ALTER TABLE public.attendance_event OWNER TO postgres;

--
-- TOC entry 234 (class 1259 OID 24713)
-- Name: attendance_event_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.attendance_event ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.attendance_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 233 (class 1259 OID 24691)
-- Name: attendance_session; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance_session (
    id bigint NOT NULL,
    timetable_id bigint NOT NULL,
    opened_by bigint NOT NULL,
    started_at timestamp without time zone NOT NULL,
    ended_at timestamp without time zone,
    status character varying(20) NOT NULL,
    qr_secret_version integer NOT NULL,
    week_number integer NOT NULL
);


ALTER TABLE public.attendance_session OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 24690)
-- Name: attendance_session_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.attendance_session ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.attendance_session_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 239 (class 1259 OID 24764)
-- Name: audit_event; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_event (
    id bigint NOT NULL,
    actor_id bigint NOT NULL,
    action character varying(50) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id bigint NOT NULL,
    before_value text,
    after_value text,
    reason text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.audit_event OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 24763)
-- Name: audit_event_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.audit_event ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.audit_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 237 (class 1259 OID 24737)
-- Name: correction_request; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.correction_request (
    id bigint NOT NULL,
    attendance_event_id bigint NOT NULL,
    evidence text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    reviewer_id bigint,
    reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.correction_request OWNER TO postgres;

--
-- TOC entry 236 (class 1259 OID 24736)
-- Name: correction_request_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.correction_request ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.correction_request_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 223 (class 1259 OID 24603)
-- Name: courses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.courses (
    id bigint NOT NULL,
    course_code character varying(50) NOT NULL,
    name character varying(150) NOT NULL
);


ALTER TABLE public.courses OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 24602)
-- Name: courses_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.courses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.courses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 227 (class 1259 OID 24636)
-- Name: enrollment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.enrollment (
    id bigint NOT NULL,
    student_id bigint NOT NULL,
    section_id bigint NOT NULL,
    enrolled_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL
);


ALTER TABLE public.enrollment OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 24635)
-- Name: enrollment_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.enrollment ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.enrollment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 229 (class 1259 OID 24661)
-- Name: rooms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rooms (
    id bigint NOT NULL,
    name character varying(100) NOT NULL,
    building character varying(100),
    capacity integer,
    type character varying(30)
);


ALTER TABLE public.rooms OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 24660)
-- Name: rooms_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.rooms ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.rooms_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 225 (class 1259 OID 24614)
-- Name: sections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sections (
    id bigint NOT NULL,
    course_id bigint NOT NULL,
    staff_id bigint NOT NULL,
    section_code character varying(50) NOT NULL,
    semester character varying(30) NOT NULL,
    academic_year character varying(20) NOT NULL
);


ALTER TABLE public.sections OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 24613)
-- Name: sections_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.sections ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 231 (class 1259 OID 24669)
-- Name: timetable; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.timetable (
    id bigint NOT NULL,
    section_id bigint NOT NULL,
    room_id bigint NOT NULL,
    day_of_week character varying(20) NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL
);


ALTER TABLE public.timetable OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 24668)
-- Name: timetable_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.timetable ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.timetable_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 221 (class 1259 OID 24578)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    name character varying(150) NOT NULL,
    role character varying(30) NOT NULL,
    student_code character varying(50),
    staff_code character varying(50),
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 220 (class 1259 OID 24577)
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.users ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 4974 (class 2606 OID 24723)
-- Name: attendance_event attendance_event_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_event
    ADD CONSTRAINT attendance_event_pkey PRIMARY KEY (id);


--
-- TOC entry 4972 (class 2606 OID 24702)
-- Name: attendance_session attendance_session_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_session
    ADD CONSTRAINT attendance_session_pkey PRIMARY KEY (id);


--
-- TOC entry 4980 (class 2606 OID 24778)
-- Name: audit_event audit_event_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_event
    ADD CONSTRAINT audit_event_pkey PRIMARY KEY (id);


--
-- TOC entry 4978 (class 2606 OID 24752)
-- Name: correction_request correction_request_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.correction_request
    ADD CONSTRAINT correction_request_pkey PRIMARY KEY (id);


--
-- TOC entry 4958 (class 2606 OID 24612)
-- Name: courses courses_course_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_course_code_key UNIQUE (course_code);


--
-- TOC entry 4960 (class 2606 OID 24610)
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- TOC entry 4964 (class 2606 OID 24647)
-- Name: enrollment enrollment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_pkey PRIMARY KEY (id);


--
-- TOC entry 4968 (class 2606 OID 24667)
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);


--
-- TOC entry 4962 (class 2606 OID 24624)
-- Name: sections sections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_pkey PRIMARY KEY (id);


--
-- TOC entry 4970 (class 2606 OID 24679)
-- Name: timetable timetable_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.timetable
    ADD CONSTRAINT timetable_pkey PRIMARY KEY (id);


--
-- TOC entry 4966 (class 2606 OID 24649)
-- Name: enrollment unique_student_section; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT unique_student_section UNIQUE (student_id, section_id);


--
-- TOC entry 4976 (class 2606 OID 24725)
-- Name: attendance_event unique_student_session; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_event
    ADD CONSTRAINT unique_student_session UNIQUE (session_id, student_id);


--
-- TOC entry 4950 (class 2606 OID 24597)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 4952 (class 2606 OID 24595)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 4954 (class 2606 OID 24601)
-- Name: users users_staff_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_staff_code_key UNIQUE (staff_code);


--
-- TOC entry 4956 (class 2606 OID 24599)
-- Name: users users_student_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_student_code_key UNIQUE (student_code);


--
-- TOC entry 4993 (class 2606 OID 24779)
-- Name: audit_event fk_audit_actor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_event
    ADD CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- TOC entry 4991 (class 2606 OID 24753)
-- Name: correction_request fk_correction_event; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.correction_request
    ADD CONSTRAINT fk_correction_event FOREIGN KEY (attendance_event_id) REFERENCES public.attendance_event(id);


--
-- TOC entry 4992 (class 2606 OID 24758)
-- Name: correction_request fk_correction_reviewer; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.correction_request
    ADD CONSTRAINT fk_correction_reviewer FOREIGN KEY (reviewer_id) REFERENCES public.users(id);


--
-- TOC entry 4983 (class 2606 OID 24655)
-- Name: enrollment fk_enrollment_section; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT fk_enrollment_section FOREIGN KEY (section_id) REFERENCES public.sections(id);


--
-- TOC entry 4984 (class 2606 OID 24650)
-- Name: enrollment fk_enrollment_student; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT fk_enrollment_student FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- TOC entry 4989 (class 2606 OID 24726)
-- Name: attendance_event fk_event_session; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_event
    ADD CONSTRAINT fk_event_session FOREIGN KEY (session_id) REFERENCES public.attendance_session(id);


--
-- TOC entry 4990 (class 2606 OID 24731)
-- Name: attendance_event fk_event_student; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_event
    ADD CONSTRAINT fk_event_student FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- TOC entry 4981 (class 2606 OID 24625)
-- Name: sections fk_sections_course; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT fk_sections_course FOREIGN KEY (course_id) REFERENCES public.courses(id);


--
-- TOC entry 4982 (class 2606 OID 24630)
-- Name: sections fk_sections_staff; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT fk_sections_staff FOREIGN KEY (staff_id) REFERENCES public.users(id);


--
-- TOC entry 4987 (class 2606 OID 24708)
-- Name: attendance_session fk_session_opened_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_session
    ADD CONSTRAINT fk_session_opened_by FOREIGN KEY (opened_by) REFERENCES public.users(id);


--
-- TOC entry 4988 (class 2606 OID 24703)
-- Name: attendance_session fk_session_timetable; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_session
    ADD CONSTRAINT fk_session_timetable FOREIGN KEY (timetable_id) REFERENCES public.timetable(id);


--
-- TOC entry 4985 (class 2606 OID 24685)
-- Name: timetable fk_timetable_room; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.timetable
    ADD CONSTRAINT fk_timetable_room FOREIGN KEY (room_id) REFERENCES public.rooms(id);


--
-- TOC entry 4986 (class 2606 OID 24680)
-- Name: timetable fk_timetable_section; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.timetable
    ADD CONSTRAINT fk_timetable_section FOREIGN KEY (section_id) REFERENCES public.sections(id);


-- Completed on 2026-09-20 23:56:07

--
-- PostgreSQL database dump complete
--

\unrestrict Gb8RKqgkeUsfyo1LjN6QCUUPBel5gli9OUPPNdQw0OkJhqR5CmJusi9irypiPTw

