"use client";

import { Modal as RsModal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "lg",
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  return (
    <RsModal isOpen={isOpen} toggle={onClose} centered scrollable size={size === "md" ? undefined : size} backdrop="static" keyboard>
      <ModalHeader toggle={onClose}>
        {title}
        {subtitle ? <p className="text-muted fs-13 mb-0 fw-normal">{subtitle}</p> : null}
      </ModalHeader>
      <ModalBody>{children}</ModalBody>
      {footer ? <ModalFooter>{footer}</ModalFooter> : null}
    </RsModal>
  );
}
